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
2. The Swift Translator popup appears just below your selection (flipping above it near the bottom of the window).
3. The built-in AI detects the source language (if auto-detect is enabled) and translates it into your preferred target language.
4. **Copying**: Click the copy icon in the popup header. You can also select the translated text directly and copy it by hand.
5. **Dismissing**: Press `Esc`, click the × in the header, click anywhere outside the popup, or highlight new text.

If the text you highlighted is already in your target language, nothing is shown — there is nothing to translate.

Very large selections are capped at 4,000 characters; the popup tells you when it truncated something.

### Moving the Popup
If the translation box covers something important:
- Drag it by its header or edges. The translated text itself stays selectable, and the popup is always kept inside the window.
- Once you move it, it stays where you put it until you press `Esc`.

### Pausing the Extension
Click the toolbar icon or press `Alt+Shift+T`. An **OFF** badge appears on the icon while it is paused, and the badge is restored when you restart Chrome.

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
- **Model Download Progress**: The first translation of a new language pair needs Chrome to download that model. You will see a live progress percentage in the popup. You can also download it ahead of time from the Settings page, which shows the status of your current language pair and offers a **Download now** button.
- **"Chrome can't translate X → Y yet"**: Chrome does not ship a model for that pair. Try a different target language.
- **Nothing happens on some pages**: Chrome blocks extensions on `chrome://` pages, the Chrome Web Store, and other extensions' pages. Text inside embedded iframes is also not translated yet.
