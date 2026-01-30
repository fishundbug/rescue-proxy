# Rescue Proxy

SillyTavern 后端插件 —— AI 响应救援代理服务器

## ✨ 特性

- 🔒 **完全无侵入** — 无需修改 SillyTavern 任何源代码，通过标准插件和扩展机制实现
- 🔄 **代理转发** — 转发 AI API 请求并监控响应
- 💾 **自动救援** — 浏览器异常时自动保存 AI 回复到本地
- 🔐 **API Key 验证** — 可选的请求来源验证
- 📥 **配置导入** — 从 SillyTavern 现有配置一键导入
- 🔍 **检查更新** — 检查 GitHub 最新版本

## 🛡️ 为什么选择 Rescue Proxy？

当你在使用 SillyTavern 与 AI 对话时，可能会遇到以下情况：

- 🌐 网络波动导致页面刷新
- 💻 浏览器意外崩溃
- 📱 手机浏览器后台冻结
- 🔌 浏览器标签页被误关闭

在这些情况下，AI 已经生成的回复会丢失。**Rescue Proxy 会在后台自动保存这些回复**，确保你不会丢失任何重要的对话内容。

### 完全无侵入性设计

Rescue Proxy 采用**中间代理**架构，完全独立于 SillyTavern 核心运行：

- ✅ 不修改 SillyTavern 任何源文件
- ✅ 不干扰 SillyTavern 的正常更新
- ✅ 通过标准 API 接口实现功能
- ✅ 可随时启用/禁用，不留任何痕迹
- ✅ 卸载后 SillyTavern 完全恢复原状

## 🔧 工作原理

```
SillyTavern → Rescue Proxy (127.0.0.1:5501) → 真实 AI API
                    ↓
              浏览器 5 秒内未确认？
                    ↓
              自动保存到 chat-recovery/
```

1. 所有 AI 请求通过本地代理服务器转发
2. 代理记录每次 AI 的回复内容
3. 等待浏览器确认收到消息
4. 如果 5 秒内未确认（网络中断/页面崩溃），自动保存回复
5. 如果确认收到，取消保存（避免重复）

## 📦 安装

```bash
cd SillyTavern/plugins
git clone https://github.com/fishundbug/rescue-proxy.git
```

重启 SillyTavern 即可。

## ⚙️ 配置

需配合前端扩展 [rescue-proxy-ui](https://github.com/fishundbug/rescue-proxy-ui) 使用。

在扩展设置面板中配置：
- **从 SillyTavern 导入** — 选择已有的 API 配置一键导入
- **API 地址** — 真实 AI API 端点
- **API Key** — 真实 API 密钥
- **代理端口** — 本地代理端口（默认 5501）
- **代理 API Key** — 可选，验证请求来源

## 🚀 使用

1. 在 SillyTavern 的 **Chat Completion** 设置中选择 `Custom (OpenAI-compatible)`
2. 将 API 地址设为 `http://127.0.0.1:5501/v1`
3. API Key 填写代理 API Key（若未配置可填任意值）

## 🔄 更新

在扩展设置面板点击「检查更新」按钮，查看后端插件和前端扩展的版本状态。

## 📄 许可证

MIT
