# Swift Translator ⚡️

A high-performance, 100% private, beautifully designed Chrome extension that translates text instantly using your browser's built-in Local AI.

![Swift Translator Demo](./docs/demo.png)

## Features
- **Lightning Fast**: Powered by Chrome's built-in AI Translation API. Loaded models are reused between selections, so only the first translation of a language pair waits on a download.
- **100% Private**: Translations happen locally on your device. Absolutely no text is sent to external servers — the extension makes no network requests of its own.
- **Appears where you're reading**: The popup opens next to your selection and can be dragged anywhere; press `Esc` to dismiss it.
- **Isolated UI**: The popup renders in a shadow root, so page styles can't distort it and it can't disturb the page.
- **Smart Language Detection**: Uses Chrome's on-device `LanguageDetector`, falling back to `chrome.i18n`.
- **RTL Support**: Seamlessly handles Right-to-Left languages like Arabic, Hebrew and Persian.
- **Pause anytime**: Click the toolbar icon or press `Alt+Shift+T`.

## Getting Started

1. **Check your Chrome**: You need Chrome 138 or later on desktop. The built-in Translator API is enabled by default — no flags to turn on. Mobile Chrome does not support it.
2. **Install**: Open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked**. Choose the `src` folder.
3. **Use**: Highlight any text on any webpage to see the translation instantly. The first translation of a new language pair downloads that model, with a progress bar in the popup.

## Documentation
For full instructions, troubleshooting, and configuration details, please see the [Full Guide](./docs/guide.md).

## Architecture
- `content.js`: Injects the translation UI, handles drag-and-drop, theme application, and communicates with the Local AI models.
- `options.js` & `options.html`: A full-page, responsive dashboard for managing your preferences, built with modern CSS grids.
- `background.js`: Service worker — seeds defaults without clobbering saved settings, keeps the toolbar badge in sync, and handles the toggle shortcut.

## Development
```bash
npm install
npm test     # jest
npm run lint # eslint
npm run build # produces dist/swift-translator.zip
```
