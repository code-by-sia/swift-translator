# Swift Translator: Complete User Guide

Welcome to **Swift Translator**! This browser extension leverages the power of Chrome's built-in Local AI Translation API to provide instantaneous, 100% private translations without ever sending your data to the cloud.

## Installation

1. **Enable Chrome Flags**: 
   Since this extension uses experimental local AI features, you must enable them in your browser:
   - Go to `chrome://flags/#translation-api` in your address bar.
   - Set the flag to **Enabled**.
   - Restart your browser.
2. **Load the Extension**:
   - Go to `chrome://extensions/`.
   - Enable **Developer mode** in the top right corner.
   - Click **Load unpacked** and select the `src` folder of this project.

## How to Use

### Translating Text
Translating text is designed to be frictionless:
1. Highlight any text on any web page.
2. The Swift Translator popup will instantly appear near your cursor.
3. The built-in AI will detect the source language (if auto-detect is enabled) and translate it into your preferred target language.
4. **Copying**: Click the copy icon in the top right of the translated text box to copy the result to your clipboard.
5. **Dismissing**: Click anywhere outside the popup, or simply highlight new text to dismiss it.

### Moving the Popup
If the translation box is covering important information on the page:
- Click and drag anywhere inside the popup to move it around the screen.

### Configuring Settings
You can customize your experience via the Settings Dashboard:
1. Hover over the translation popup and click the **Settings** gear icon in the bottom right corner, or click the extension icon in your browser toolbar and select **Options**.
2. **Auto-Detect Language**: Toggle this on to let the AI automatically determine the language you highlighted.
3. **Fallback / From Language**: If auto-detect fails or is disabled, the AI will assume the text is in this language.
4. **To Language**: The language you want the text translated into.
5. **Theme**: Choose between Light, Dark, System Default, or Dynamic (adapts to the specific web page you are viewing).

## Privacy & Security

**100% Local Execution**: Swift Translator runs the Large Language Model directly on your machine. This means:
- No internet connection is required for translations once the language models are downloaded.
- Your reading habits and selected texts are completely private.
- No data is ever transmitted to external servers.

## Troubleshooting

- **Error: Extension context invalidated**: This happens if the extension was updated in the background. Simply refresh the web page you are on to reload the extension scripts.
- **Model Download Progress**: If you are translating a new language pair for the first time, Chrome may need to download the language model. You will see a live progress percentage in the popup.
