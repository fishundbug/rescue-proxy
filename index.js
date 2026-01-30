/**
 * Rescue Proxy - SillyTavern AI API 中转代理插件
 * 
 * 功能：代理 AI API 请求，同时将回复保存到聊天记录
 * 
 * 由于 SillyTavern 的 CSRF 保护，插件启动独立的 HTTP 服务器来接收 API 请求
 * 
 * API 端点（独立服务器，默认端口 5501）：
 * - POST /v1/chat/completions - OpenAI 兼容聊天完成 API
 * - GET /health - 健康检查
 * 
 * 内部端点（通过 SillyTavern 路由）：
 * - GET /settings - 获取设置
 * - POST /settings - 保存设置
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendMessageToChat } from './chat-writer.js';

// 获取当前文件所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 设置文件路径（保存在插件目录下）
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// 插件信息
export const info = {
    id: 'rescue-proxy',
    name: 'Rescue Proxy',
    description: 'AI API 中转代理 - 确保回复在浏览器断开时也能保存',
};

// 默认代理端口
const DEFAULT_PROXY_PORT = 5501;

// 默认设置
const defaultSettings = {
    realApiUrl: 'https://api.openai.com/v1',
    realApiKey: '',
    proxyPort: DEFAULT_PROXY_PORT,
    proxyApiKey: '',  // 代理服务器的 API Key（用于验证请求来源）
};

// 用户设置存储（内存中）
let cachedSettings = null;

// 用户目录存储（由前端上报）
const userDirectoriesCache = new Map();

// 最近的聊天上下文（由前端在发送消息前同步）
// 用于 SillyTavern 后端发出的请求（不经过浏览器）
let lastChatContext = null;

// 待保存的请求（多请求并发支持）
// 结构：requestId → { content, model, genStarted, genFinished, chatContext, userDirectories, timeoutId }
const pendingRequests = new Map();

// 延迟保存超时时间（毫秒）
const SAVE_DELAY_MS = 5000;

// 独立服务器实例
let proxyServer = null;

/**
 * 从文件加载设置
 */
function loadSettingsFromFile() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
            cachedSettings = { ...defaultSettings, ...JSON.parse(data) };
            console.log('[rescue-proxy] 已从文件加载设置');
        } else {
            cachedSettings = { ...defaultSettings };
        }
    } catch (error) {
        console.error('[rescue-proxy] 加载设置文件失败:', error);
        cachedSettings = { ...defaultSettings };
    }
    return cachedSettings;
}

/**
 * 保存设置到文件
 */
function saveSettingsToFile() {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(cachedSettings, null, 2), 'utf-8');
        console.log('[rescue-proxy] 设置已保存到文件');
    } catch (error) {
        console.error('[rescue-proxy] 保存设置文件失败:', error);
    }
}

/**
 * 获取用户设置
 */
function getSettings() {
    if (!cachedSettings) {
        loadSettingsFromFile();
    }
    return cachedSettings;
}

/**
 * 初始化插件
 */
export async function init(router) {
    console.log('[rescue-proxy] 插件初始化中...');

    // 初始化时加载保存的设置
    loadSettingsFromFile();

    // 设置 API（通过 SillyTavern 路由，有 CSRF 保护）
    router.get('/settings', (req, res) => {
        const settings = getSettings();
        res.json({
            realApiUrl: settings.realApiUrl,
            realApiKey: settings.realApiKey || '',
            proxyPort: settings.proxyPort,
            proxyApiKey: settings.proxyApiKey || '',
        });
    });

    router.post('/settings', (req, res) => {
        const settings = getSettings();
        let portChanged = false;

        if (req.body.realApiUrl) {
            settings.realApiUrl = req.body.realApiUrl;
        }
        if (req.body.realApiKey !== undefined) {
            settings.realApiKey = req.body.realApiKey;
        }
        if (req.body.proxyPort !== undefined) {
            const newPort = parseInt(req.body.proxyPort, 10);
            if (newPort > 0 && newPort < 65536 && newPort !== settings.proxyPort) {
                settings.proxyPort = newPort;
                portChanged = true;
            }
        }
        if (req.body.proxyApiKey !== undefined) {
            settings.proxyApiKey = req.body.proxyApiKey;
        }

        console.log('[rescue-proxy] 设置已更新');
        saveSettingsToFile();
        res.json({ success: true, portChanged });
    });

    // 注册用户目录（前端调用）
    router.post('/register-context', (req, res) => {
        const userDirectories = req.user?.directories;

        if (userDirectories) {
            userDirectoriesCache.set('default', userDirectories);
            console.log('[rescue-proxy] 已注册用户目录');
        }

        res.json({ success: true });
    });

    // 设置当前聊天上下文（前端在发送消息前调用）
    // 用于 SillyTavern 后端发出的请求（不带 X-Chat-Context header）
    router.post('/set-chat-context', (req, res) => {
        lastChatContext = req.body;
        console.log(`[rescue-proxy] 已设置聊天上下文: ${lastChatContext?.characterName || 'unknown'}`);
        res.json({ success: true });
    });

    // 确认已收到消息（浏览器在成功接收 AI 响应后调用）
    // 取消最近一条待保存任务
    router.post('/confirm-received', (req, res) => {
        if (pendingRequests.size > 0) {
            const lastKey = Array.from(pendingRequests.keys()).pop();
            const lastPending = pendingRequests.get(lastKey);
            if (lastPending) {
                clearTimeout(lastPending.timeoutId);
                pendingRequests.delete(lastKey);
                console.log('[rescue-proxy] 浏览器已确认收到消息，取消延迟保存');
            }
        }

        res.json({ success: true });
    });

    // 获取可导入的配置列表（排除本插件端点）
    router.get('/available-profiles', (req, res) => {
        try {
            const userDirectories = req.user?.directories;
            if (!userDirectories) {
                return res.status(400).json({ error: '用户目录未找到' });
            }

            // 读取 settings.json
            const settingsPath = path.join(userDirectories.root, 'settings.json');
            if (!fs.existsSync(settingsPath)) {
                return res.json({ profiles: [] });
            }

            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            const profiles = settings.extension_settings?.connectionManager?.profiles || [];

            // 获取当前代理端口
            const currentPort = getSettings().proxyPort;
            const proxyPatterns = [
                `127.0.0.1:${currentPort}`,
                `localhost:${currentPort}`,
            ];

            // 过滤掉使用本插件端点的配置
            const availableProfiles = profiles
                .filter(p => {
                    const apiUrl = p['api-url'] || '';
                    return !proxyPatterns.some(pattern => apiUrl.includes(pattern));
                })
                .map(p => ({
                    id: p.id,
                    name: p.name || '未命名配置',
                    apiUrl: p['api-url'] || '',
                    model: p.model || '',
                }));

            res.json({ profiles: availableProfiles });
        } catch (error) {
            console.error('[rescue-proxy] 获取可用配置失败:', error);
            res.status(500).json({ error: '获取配置失败' });
        }
    });

    // 导入指定配置
    router.post('/import-profile', (req, res) => {
        try {
            const { profileId } = req.body;
            const userDirectories = req.user?.directories;

            if (!profileId) {
                return res.status(400).json({ error: '未指定配置 ID' });
            }
            if (!userDirectories) {
                return res.status(400).json({ error: '用户目录未找到' });
            }

            // 读取 settings.json
            const settingsPath = path.join(userDirectories.root, 'settings.json');
            if (!fs.existsSync(settingsPath)) {
                return res.status(404).json({ error: '配置文件未找到' });
            }

            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            const profiles = settings.extension_settings?.connectionManager?.profiles || [];
            const profile = profiles.find(p => p.id === profileId);

            if (!profile) {
                return res.status(404).json({ error: '配置未找到' });
            }

            // 获取 API URL
            const apiUrl = profile['api-url'] || '';

            // 通过 secret-id 获取 API Key
            let apiKey = '';
            const secretId = profile['secret-id'];
            if (secretId) {
                const secretsPath = path.join(userDirectories.root, 'secrets.json');
                if (fs.existsSync(secretsPath)) {
                    const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
                    const customKeys = secrets['api_key_custom'] || [];
                    const matchedKey = customKeys.find(k => k.id === secretId);
                    apiKey = matchedKey?.value || '';
                }
            }

            // 更新插件设置
            const pluginSettings = getSettings();
            pluginSettings.realApiUrl = apiUrl;
            if (apiKey) {
                pluginSettings.realApiKey = apiKey;
            }
            saveSettingsToFile();

            console.log(`[rescue-proxy] 已导入配置: ${profile.name || profileId}`);
            res.json({
                success: true,
                imported: {
                    apiUrl,
                    hasApiKey: !!apiKey,
                    profileName: profile.name || '未命名配置',
                }
            });
        } catch (error) {
            console.error('[rescue-proxy] 导入配置失败:', error);
            res.status(500).json({ error: '导入配置失败' });
        }
    });

    // 检查 GitHub 更新
    router.get('/check-update', async (req, res) => {
        try {
            const owner = 'fishundbug';
            const userDirectories = req.user?.directories;

            // 获取前端扩展路径（优先全局安装，其次用户安装）
            const getUiExtensionPath = () => {
                // 全局安装路径
                const globalPath = path.join(process.cwd(), 'public', 'scripts', 'extensions', 'third-party', 'rescue-proxy-ui');
                if (fs.existsSync(globalPath)) {
                    return { path: globalPath, type: '全局' };
                }
                // 用户安装路径
                if (userDirectories?.extensions) {
                    const userPath = path.join(userDirectories.extensions, 'rescue-proxy-ui');
                    if (fs.existsSync(userPath)) {
                        return { path: userPath, type: '用户' };
                    }
                }
                return { path: null, type: null };
            };

            const uiExtension = getUiExtensionPath();

            // 定义要检查的仓库
            const repos = [
                {
                    name: '后端插件',
                    repo: 'rescue-proxy',
                    localPath: __dirname,
                },
                {
                    name: `前端扩展${uiExtension.type ? ` (${uiExtension.type})` : ''}`,
                    repo: 'rescue-proxy-ui',
                    localPath: uiExtension.path,
                },
            ];

            const results = [];

            for (const { name, repo, localPath } of repos) {
                let localCommit = null;
                let localVersion = 'unknown';

                // 获取本地版本
                if (localPath) {
                    const packagePath = path.join(localPath, 'package.json');
                    const manifestPath = path.join(localPath, 'manifest.json');

                    if (fs.existsSync(packagePath)) {
                        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
                        localVersion = pkg.version || 'unknown';
                    } else if (fs.existsSync(manifestPath)) {
                        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                        localVersion = manifest.version || 'unknown';
                    }

                    // 获取本地 git commit
                    const gitHeadPath = path.join(localPath, '.git', 'HEAD');
                    if (fs.existsSync(gitHeadPath)) {
                        const headContent = fs.readFileSync(gitHeadPath, 'utf-8').trim();
                        if (headContent.startsWith('ref: ')) {
                            const refPath = path.join(localPath, '.git', headContent.slice(5));
                            if (fs.existsSync(refPath)) {
                                localCommit = fs.readFileSync(refPath, 'utf-8').trim().slice(0, 7);
                            }
                        } else {
                            localCommit = headContent.slice(0, 7);
                        }
                    }
                }

                // 调用 GitHub API 获取最新提交
                let latestCommit = null;
                let latestMessage = '';

                try {
                    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`;
                    const response = await fetch(apiUrl, {
                        headers: {
                            'User-Agent': 'SillyTavern-RescueProxy',
                            'Accept': 'application/vnd.github.v3+json',
                        },
                    });

                    if (response.ok) {
                        const commits = await response.json();
                        latestCommit = commits[0]?.sha?.slice(0, 7) || null;
                        latestMessage = commits[0]?.commit?.message?.split('\n')[0] || '';
                    }
                } catch (e) {
                    console.error(`[rescue-proxy] 获取 ${repo} 更新失败:`, e);
                }

                const hasUpdate = localCommit && latestCommit && localCommit !== latestCommit;

                results.push({
                    name,
                    repo,
                    localVersion,
                    localCommit,
                    latestCommit,
                    latestMessage,
                    hasUpdate,
                    repoUrl: `https://github.com/${owner}/${repo}`,
                });
            }

            // 总体是否有更新
            const hasAnyUpdate = results.some(r => r.hasUpdate);

            res.json({
                success: true,
                hasAnyUpdate,
                repos: results,
            });
        } catch (error) {
            console.error('[rescue-proxy] 检查更新失败:', error);
            res.status(500).json({ error: error.message || '检查更新失败' });
        }
    });

    // 启动独立的代理服务器
    startProxyServer();

    console.log('[rescue-proxy] 插件初始化完成');
}

/**
 * 启动独立的 HTTP 代理服务器
 */
function startProxyServer() {
    proxyServer = http.createServer(async (req, res) => {
        // 设置 CORS 允许所有来源
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Chat-Context, X-User-Handle, X-Rescue-Token');

        // 处理 OPTIONS 预检请求
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = req.url || '';

        // health 端点不需要验证（用于检测服务器是否运行）
        if (url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', plugin: info.id, version: '1.0.0', port: getSettings().proxyPort }));
            return;
        }

        // 验证代理 API Key（除 health 外的所有端点）
        const settings = getSettings();
        if (settings.proxyApiKey) {
            // 从 Authorization header 提取 Bearer token
            const authHeader = req.headers['authorization'] || '';
            const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

            if (!bearerToken || bearerToken !== settings.proxyApiKey) {
                console.warn(`[rescue-proxy] 拒绝未授权请求: ${url}`);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Unauthorized: Invalid API Key', type: 'auth_error' } }));
                return;
            }
        }

        // 路由

        // 健康检查端点 - 用于前端测试代理服务器连接
        if (url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', port: getSettings().proxyPort }));
            return;
        }

        // 模型列表端点 - 用于 SillyTavern 连接测试
        if ((url === '/v1/models' || url === '/models') && req.method === 'GET') {
            const settings = getSettings();
            if (!settings.realApiKey) {
                // 返回一个基本的模型列表，即使没有配置 API Key
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    object: 'list',
                    data: [{ id: 'rescue-proxy', object: 'model', owned_by: 'rescue-proxy' }]
                }));
                return;
            }
            // 转发到真实 API 获取模型列表
            try {
                const response = await fetch(`${settings.realApiUrl}/models`, {
                    headers: { 'Authorization': `Bearer ${settings.realApiKey}` }
                });
                const data = await response.text();
                res.writeHead(response.status, { 'Content-Type': 'application/json' });
                res.end(data);
            } catch (error) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    object: 'list',
                    data: [{ id: 'rescue-proxy', object: 'model', owned_by: 'rescue-proxy' }]
                }));
            }
            return;
        }

        if (url === '/v1/chat/completions' && req.method === 'POST') {
            await handleChatCompletions(req, res);
            return;
        }

        // 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    });

    const port = getSettings().proxyPort;
    proxyServer.listen(port, '127.0.0.1', () => {
        console.log(`[rescue-proxy] 代理服务器已启动: http://127.0.0.1:${port}`);
        console.log(`[rescue-proxy] 请将 SillyTavern 的 Custom API 地址设为: http://127.0.0.1:${port}/v1`);
    });

    proxyServer.on('error', (err) => {
        console.error('[rescue-proxy] 代理服务器错误:', err);
    });
}

/**
 * 处理聊天完成请求
 */
async function handleChatCompletions(req, res) {
    // 读取请求体
    let body = '';
    for await (const chunk of req) {
        body += chunk;
    }

    let reqBody;
    try {
        reqBody = JSON.parse(body);
    } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid JSON' } }));
        return;
    }

    // 获取设置和用户目录
    const settings = getSettings();
    const userDirectories = userDirectoriesCache.get('default');

    // 从请求头获取聊天上下文（优先）或使用前端同步的上下文（回退）
    let chatContext = null;
    try {
        const chatContextHeader = req.headers['x-chat-context'];
        if (chatContextHeader) {
            chatContext = JSON.parse(chatContextHeader);
        }
    } catch (e) {
        console.warn('[rescue-proxy] 解析 X-Chat-Context 失败:', e);
    }

    // 如果没有从请求头获取到，使用前端同步的 lastChatContext
    if (!chatContext && lastChatContext) {
        chatContext = lastChatContext;
        console.log('[rescue-proxy] 使用前端同步的 chatContext');
    }

    // 生成请求 ID（用于 Map key 追踪，仅内部使用）
    const requestId = `req-${Date.now()}`;

    const isStreaming = reqBody.stream === true;
    const model = reqBody.model || 'unknown';
    const genStarted = new Date().toISOString();

    // 检测是否为测试消息（SillyTavern 的"发送测试消息"按钮）
    // 测试消息特征：只有一条内容为 "Hi" 的 user 消息
    const messages = reqBody.messages || [];
    const isTestMessage = messages.length === 1 &&
        messages[0]?.role === 'user' &&
        messages[0]?.content === 'Hi';

    // 调试日志
    console.log(`[rescue-proxy] 收到请求 - 模型: ${model}, 流式: ${isStreaming}, 测试消息: ${isTestMessage}`);

    if (!settings.realApiKey) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                message: 'Rescue Proxy: 未配置 API Key，请在扩展设置中配置',
                type: 'configuration_error',
            },
        }));
        return;
    }

    try {
        // 转发请求到真实 API
        const response = await fetch(`${settings.realApiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.realApiKey}`,
            },
            body: JSON.stringify(reqBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[rescue-proxy] API 请求失败: ${response.status}`);
            res.writeHead(response.status, { 'Content-Type': 'text/plain' });
            res.end(errorText);
            return;
        }

        if (isStreaming) {
            await handleStreamingResponse(res, response, chatContext, userDirectories, model, genStarted, isTestMessage, requestId);
        } else {
            await handleNonStreamingResponse(res, response, chatContext, userDirectories, model, genStarted, isTestMessage, requestId);
        }

    } catch (error) {
        console.error('[rescue-proxy] 请求错误:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                message: `Rescue Proxy 错误: ${error.message}`,
                type: 'proxy_error',
            },
        }));
    }
}

/**
 * 处理流式响应
 */
async function handleStreamingResponse(res, apiResponse, chatContext, userDirectories, model, genStarted, isTestMessage = false, requestId) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    let fullContent = '';
    let hasError = false;

    try {
        const reader = apiResponse.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            res.write(chunk);

            // 解析并收集内容
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const delta = data.choices?.[0]?.delta?.content;
                        if (delta) {
                            fullContent += delta;
                        }
                    } catch {
                        // 忽略解析错误
                    }
                }
            }
        }

        res.end();

    } catch (error) {
        console.error('[rescue-proxy] 流式传输错误:', error);
        hasError = true;
        res.end();
    }

    // 保存到聊天记录（跳过测试消息）
    const genFinished = new Date().toISOString();
    if (!hasError && fullContent && chatContext && userDirectories && !isTestMessage) {
        scheduleSave(requestId || `fallback-${Date.now()}`, userDirectories, chatContext, fullContent, model, genStarted, genFinished);
    } else {
        console.log(`[rescue-proxy] 跳过保存 - hasError: ${hasError}, hasContent: ${!!fullContent}, hasChatContext: ${!!chatContext}, hasUserDirs: ${!!userDirectories}, isTestMessage: ${isTestMessage}`);
    }
}

/**
 * 处理非流式响应
 */
async function handleNonStreamingResponse(res, apiResponse, chatContext, userDirectories, model, genStarted, isTestMessage = false, requestId) {
    try {
        const data = await apiResponse.json();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));

        // 提取内容并保存（跳过测试消息）
        const content = data.choices?.[0]?.message?.content;
        const genFinished = new Date().toISOString();

        if (content && chatContext && userDirectories && !isTestMessage) {
            scheduleSave(requestId || `fallback-${Date.now()}`, userDirectories, chatContext, content, model, genStarted, genFinished);
        } else {
            console.log(`[rescue-proxy] 跳过保存 - hasContent: ${!!content}, hasChatContext: ${!!chatContext}, hasUserDirs: ${!!userDirectories}, isTestMessage: ${isTestMessage}`);
        }

    } catch (error) {
        console.error('[rescue-proxy] 非流式响应处理错误:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message, type: 'parse_error' } }));
    }
}

/**
 * 延迟保存到聊天记录
 * 设置超时等待浏览器确认，若未确认则执行保存
 * @param {string} requestId 请求 ID，用于多请求并发追踪
 */
function scheduleSave(requestId, userDirectories, chatContext, content, modelName, genStarted, genFinished) {
    // 如果已有相同 requestId 的待保存任务，先取消
    if (pendingRequests.has(requestId)) {
        clearTimeout(pendingRequests.get(requestId).timeoutId);
    }

    // 设置延迟保存
    const timeoutId = setTimeout(() => {
        const pending = pendingRequests.get(requestId);
        if (pending) {
            console.log(`[rescue-proxy] 浏览器未确认收到消息，执行延迟保存 (requestId: ${requestId})`);
            executeSave(pending);
            pendingRequests.delete(requestId);
        }
    }, SAVE_DELAY_MS);

    pendingRequests.set(requestId, {
        content,
        modelName,
        genStarted,
        genFinished,
        chatContext,
        userDirectories,
        timeoutId,
    });

    console.log(`[rescue-proxy] 已设置延迟保存 (requestId: ${requestId})，等待 ${SAVE_DELAY_MS}ms 确认...`);
}

/**
 * 执行实际的保存操作
 */
function executeSave(saveData) {
    try {
        const result = appendMessageToChat(saveData.userDirectories, saveData.chatContext, {
            content: saveData.content,
            apiName: 'custom',
            modelName: saveData.modelName,
            genStarted: saveData.genStarted,
            genFinished: saveData.genFinished,
        });

        if (result.success) {
            console.log(`[rescue-proxy] 延迟保存成功: ${saveData.chatContext?.characterName || 'unknown'} → ${result.chatFilePath || 'unknown'}`);
        } else {
            console.error(`[rescue-proxy] 保存失败: ${result.error}`);
        }
    } catch (error) {
        console.error('[rescue-proxy] 保存到聊天记录时出错:', error);
    }
}

/**
 * 插件退出
 */
export async function exit() {
    if (proxyServer) {
        proxyServer.close();
        console.log('[rescue-proxy] 代理服务器已关闭');
    }
    console.log('[rescue-proxy] 插件已关闭');
}
