/**
 * 聊天记录写入模块
 * 复刻 SillyTavern 的聊天保存逻辑，确保格式完全一致
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * 读取 JSONL 聊天文件
 * @param {string} chatFilePath - 聊天文件完整路径
 * @returns {Array} 聊天数据数组，第一个元素是 header
 */
export function readChatFile(chatFilePath) {
    try {
        if (!fs.existsSync(chatFilePath)) {
            console.warn(`[rescue-proxy] 聊天文件不存在: ${chatFilePath}`);
            return [];
        }

        const content = fs.readFileSync(chatFilePath, 'utf-8');
        if (!content.trim()) {
            return [];
        }

        const lines = content.split('\n').filter(line => line.trim());
        return lines.map(line => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        }).filter(Boolean);
    } catch (error) {
        console.error(`[rescue-proxy] 读取聊天文件失败:`, error);
        return [];
    }
}

/**
 * 写入 JSONL 聊天文件
 * @param {string} chatFilePath - 聊天文件完整路径
 * @param {Array} chatData - 聊天数据数组
 */
export function writeChatFile(chatFilePath, chatData) {
    try {
        // 确保目录存在
        const dir = path.dirname(chatFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const jsonlContent = chatData.map(item => JSON.stringify(item)).join('\n');
        fs.writeFileSync(chatFilePath, jsonlContent, 'utf-8');
        console.log(`[rescue-proxy] 聊天文件已保存: ${chatFilePath}`);
    } catch (error) {
        console.error(`[rescue-proxy] 写入聊天文件失败:`, error);
        throw error;
    }
}

/**
 * 获取聊天文件路径
 * @param {Object} userDirectories - 用户目录配置
 * @param {Object} chatContext - 聊天上下文
 * @returns {string} 聊天文件完整路径
 */
export function getChatFilePath(userDirectories, chatContext) {
    const { avatarUrl, chatFileName, isGroup, groupId } = chatContext;

    if (isGroup && groupId) {
        // 群组聊天
        return path.join(userDirectories.groupChats, `${groupId}.jsonl`);
    } else {
        // 角色聊天
        const characterDir = String(avatarUrl || '').replace('.png', '');
        return path.join(userDirectories.chats, characterDir, `${chatFileName}.jsonl`);
    }
}

/**
 * 生成时间戳字符串（与 SillyTavern 格式一致）
 * @returns {string} 格式化的时间戳
 */
export function getMessageTimeStamp() {
    const now = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const month = months[now.getMonth()];
    const day = now.getDate();
    const year = now.getFullYear();
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');

    return `${month} ${day}, ${year} @${hours}h ${minutes}m`;
}

/**
 * 创建消息对象（与 SillyTavern 格式完全一致）
 * @param {Object} options - 消息选项
 * @returns {Object} 消息对象
 */
export function createMessageObject(options) {
    const {
        name,
        isUser = false,
        content,
        apiName = 'custom',
        modelName = 'unknown',
        genStarted,
        genFinished,
    } = options;

    // 使用 ISO 8601 格式（与 SillyTavern 原生一致）
    const sendDate = genFinished || new Date().toISOString();
    const genStartedTime = genStarted || new Date().toISOString();
    const genFinishedTime = genFinished || new Date().toISOString();

    // 构建完整的 extra 对象（与 SillyTavern 原生一致）
    const extra = {
        api: apiName,
        model: modelName,
        reasoning: '',
        reasoning_duration: null,
        reasoning_signature: null,
        token_count: 0,
    };

    const message = {
        extra: extra,
        name: name,
        is_user: isUser,
        send_date: sendDate,
        mes: content,
        title: '',  // 添加 title 字段
        gen_started: genStartedTime,
        gen_finished: genFinishedTime,
        swipes: [content],
        swipe_id: 0,
        swipe_info: [{
            send_date: sendDate,
            gen_started: genStartedTime,
            gen_finished: genFinishedTime,
            extra: extra,
        }],
    };

    return message;
}

/**
 * 追加消息到聊天文件
 * @param {Object} userDirectories - 用户目录配置
 * @param {Object} chatContext - 聊天上下文
 * @param {Object} messageOptions - 消息选项
 * @returns {{success: boolean, error?: string}}
 */
export function appendMessageToChat(userDirectories, chatContext, messageOptions) {
    try {
        const chatFilePath = getChatFilePath(userDirectories, chatContext);

        // 读取现有聊天
        const chatData = readChatFile(chatFilePath);

        if (chatData.length === 0) {
            console.error(`[rescue-proxy] 聊天文件为空或不存在: ${chatFilePath}`);
            return { success: false, error: '聊天文件不存在' };
        }

        // 创建新消息
        const newMessage = createMessageObject({
            name: chatContext.characterName,
            isUser: false,
            content: messageOptions.content,
            apiName: messageOptions.apiName || 'openai',
            modelName: messageOptions.modelName || 'unknown',
            genStarted: messageOptions.genStarted,
            genFinished: messageOptions.genFinished,
        });

        // 追加消息
        chatData.push(newMessage);

        // 写回文件
        writeChatFile(chatFilePath, chatData);

        console.log(`[rescue-proxy] 消息已追加到聊天: ${chatContext.characterName}`);
        return { success: true };

    } catch (error) {
        console.error(`[rescue-proxy] 追加消息失败:`, error);
        return { success: false, error: error.message };
    }
}
