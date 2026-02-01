# Rescue Proxy

SillyTavern 后端插件 —— AI 响应救援代理服务器

中文 | [English](README_EN.md)

> ⚠️ **重要提示**：本插件需要配合前端扩展 [rescue-proxy-ui](https://github.com/fishundbug/rescue-proxy-ui) 一起使用才能正常工作。

## ✨ 特性

- 🔒 **完全无侵入** — 无需修改 SillyTavern 任何源代码，通过标准插件和扩展机制实现
- 🔄 **代理转发** — 转发 AI API 请求并监控响应
- 💾 **自动救援** — 浏览器异常时自动保存 AI 回复到本地
- 🔐 **API Key 验证** — 可选的请求来源验证
- 📥 **配置导入** — 从 SillyTavern 现有配置一键导入
- 📊 **请求日志** — 查看最近的 API 请求记录和响应时间
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

### 1. 安装后端插件（本仓库）

```bash
cd SillyTavern/plugins
git clone https://github.com/fishundbug/rescue-proxy.git
```

### 2. 安装前端扩展

**方式一：全局安装**
```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/fishundbug/rescue-proxy-ui.git
```

**方式二：用户安装**
在 SillyTavern 扩展管理中使用「安装扩展」，输入：
```
https://github.com/fishundbug/rescue-proxy-ui
```

重启 SillyTavern 后两个组件会自动加载。

## ⚙️ 设置面板

在扩展设置中找到 **Rescue Proxy** 面板：

### 真实 API 配置
- **从 SillyTavern 导入** — 选择已有配置一键导入
- **API 地址** — 真实 AI API 端点
- **API Key** — 真实 API 密钥

### 代理端点配置
- **代理端口** — 本地代理端口（默认 5501）
- **代理 API Key** — 可选，防止其他程序调用

### 版本信息
- **检查更新** — 检查后端插件和前端扩展是否有新版本

## 🚀 使用

1. 在 SillyTavern 的 **Chat Completion** 设置中选择 `Custom (OpenAI-compatible)`
2. 将 API 地址设为 `http://127.0.0.1:5501/v1`
3. API Key 填写代理 API Key（若未配置可填任意值）

## 📊 请求日志

在扩展设置面板的「请求日志」区域可以查看 API 请求记录：

### 按钮说明

- **刷新** — 重新加载日志（进行中 + 历史记录）
- **清理** — 清空当前显示的日志列表
- **清空历史记录** — ⚠️ 永久删除日志文件中的所有记录
- **上一页 / 下一页** — 在已加载的日志中翻页（每页 20 条）
- **显示更多** — 从服务器加载更多历史日志

日志保存到 `logs/request-logs.jsonl` 文件，重启后不会丢失。初始加载 4 页（80 条），可通过「显示更多」按需加载更多。

## 🔄 更新

在扩展设置面板点击「检查更新」按钮，查看后端插件和前端扩展的版本状态。

## 📄 许可证

MIT
