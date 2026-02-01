# Rescue Proxy

SillyTavern Backend Plugin — AI Response Rescue Proxy Server

> ⚠️ **Important**: This plugin requires the frontend extension [rescue-proxy-ui](https://github.com/fishundbug/rescue-proxy-ui) to work properly.

## ✨ Features

- 🔒 **Non-invasive** — No modification to SillyTavern source code, implemented via standard plugin/extension mechanism
- 🔄 **Proxy Forwarding** — Forwards AI API requests and monitors responses
- 💾 **Auto Rescue** — Automatically saves AI responses when browser crashes
- 🔐 **API Key Validation** — Optional request source verification
- 📥 **Config Import** — One-click import from existing SillyTavern profiles
- 📊 **Request Logs** — View recent API requests and response times
- 🔍 **Update Check** — Check for latest versions on GitHub

## 🛡️ Why Rescue Proxy?

When chatting with AI in SillyTavern, you may encounter:

- 🌐 Network issues causing page refresh
- 💻 Browser crash
- 📱 Mobile browser background freeze
- 🔌 Accidentally closing browser tab

In these cases, AI-generated responses are lost. **Rescue Proxy automatically saves these responses in the background**, ensuring you never lose important conversation content.

### Non-invasive Design

Rescue Proxy uses a **proxy architecture**, completely independent of SillyTavern core:

- ✅ Does not modify any SillyTavern source files
- ✅ Does not interfere with SillyTavern updates
- ✅ Implemented via standard API interfaces
- ✅ Can be enabled/disabled anytime without leaving traces
- ✅ SillyTavern fully restored after uninstallation

## 🔧 How It Works

```
SillyTavern → Rescue Proxy (127.0.0.1:5501) → Real AI API
                    ↓
              Browser not confirmed within 5s?
                    ↓
              Auto save to chat-recovery/
```

1. All AI requests are forwarded through local proxy server
2. Proxy records each AI response
3. Waits for browser confirmation
4. If not confirmed within 5 seconds (network/page crash), auto saves response
5. If confirmed, cancel save (avoid duplicates)

## 📦 Installation

### 1. Install Backend Plugin (This Repo)

```bash
cd SillyTavern/plugins
git clone https://github.com/fishundbug/rescue-proxy.git
```

### 2. Install Frontend Extension

**Option 1: Global Install**
```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/fishundbug/rescue-proxy-ui.git
```

**Option 2: User Install**
In SillyTavern extension manager, use "Install Extension" with:
```
https://github.com/fishundbug/rescue-proxy-ui
```

Restart SillyTavern and both components will auto-load.

## ⚙️ Settings Panel

Find **Rescue Proxy** panel in extension settings:

### Real API Configuration
- **Import from SillyTavern** — One-click import from existing profiles
- **API URL** — Real AI API endpoint
- **API Key** — Real API key

### Proxy Endpoint Configuration
- **Proxy Port** — Local proxy port (default 5501)
- **Proxy API Key** — Optional, prevents unauthorized access

### Version Info
- **Check Update** — Check for new versions of backend plugin and frontend extension

## 🚀 Usage

1. In SillyTavern **Chat Completion** settings, select `Custom (OpenAI-compatible)`
2. Set API URL to `http://127.0.0.1:5501/v1`
3. Set API Key to proxy API key (any value if not configured)

## 📊 Request Logs

View API request records in the "Request Logs" section:

### Buttons

- **Refresh** — Reload logs (pending + history)
- **Clear** — Clear current log display
- **Delete History** — ⚠️ Permanently delete all log file records
- **Previous / Next** — Navigate through loaded logs (20 per page)
- **Load More** — Load more history from server

Logs are saved to `logs/request-logs.jsonl` file, persisted across restarts. Initially loads 4 pages (80 entries), use "Load More" to load additional records.

## 🔄 Updates

Click "Check Update" button in settings panel to view version status of backend plugin and frontend extension.

## 📄 License

MIT
