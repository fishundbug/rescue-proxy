# Rescue Proxy

SillyTavern 后端插件 —— AI 响应救援代理服务器

## 功能

- 🔄 **代理转发** — 转发 AI API 请求并监控响应
- 💾 **自动救援** — 浏览器异常时自动保存 AI 回复到本地
- 🔐 **API Key 验证** — 可选的请求来源验证
- 📥 **配置导入** — 从 SillyTavern 现有配置一键导入
- 🔍 **检查更新** — 检查 GitHub 最新版本

## 工作原理

```
SillyTavern → Rescue Proxy (127.0.0.1:5501) → 真实 AI API
                    ↓
              浏览器 5 秒内未确认？
                    ↓
              自动保存到 chat-recovery/
```

## 安装

```bash
cd SillyTavern/plugins
git clone https://github.com/fishundbug/rescue-proxy.git
```

重启 SillyTavern 即可。

## 配置

需配合前端扩展 [rescue-proxy-ui](https://github.com/fishundbug/rescue-proxy-ui) 使用。

在扩展设置面板中配置：
- **从 SillyTavern 导入** — 选择已有的 API 配置一键导入
- **API 地址** — 真实 AI API 端点
- **API Key** — 真实 API 密钥
- **代理端口** — 本地代理端口（默认 5501）
- **代理 API Key** — 可选，验证请求来源

## 使用

1. 在 SillyTavern 的 **Chat Completion** 设置中选择 `Custom (OpenAI-compatible)`
2. 将 API 地址设为 `http://127.0.0.1:5501/v1`
3. API Key 填写代理 API Key（若未配置可填任意值）

## 更新

在扩展设置面板点击「检查更新」按钮，查看后端插件和前端扩展的版本状态。

## 许可证

MIT
