# Chrome Web Store Listing

Copy for the Developer Dashboard. Plain language on purpose: no feature-word
padding, no exclamation marks, no emoji headers.

## Title (max 45 characters)

```
Swift Translator: on-device translation
```

## Short description (max 132 characters)

```
Highlight text on any page to translate it. Runs on your device with Chrome's built-in model, so nothing is sent away.
```

## Detailed description

```
Swift Translator translates text you highlight on a web page, without sending it anywhere.

Chrome now ships a translation model inside the browser. Swift Translator uses that model, so the work happens on your own machine. The text you highlight is never uploaded, stored, or seen by anyone, including me.

How it works

Highlight a sentence and a small panel appears next to it with the translation. Press Esc to dismiss it, or drag it aside if it covers something you are reading. If you would rather it always opened in the same corner, you can set that and it will stay there.

The panel shows which language was detected and gives you a button to copy the result.

Settings

Pick the language you want to read in. You can also set a fallback language for the rare cases where detection is unsure, choose a light, dark, or page-matching appearance, and decide where the panel opens. Press Alt+Shift+T, or click the toolbar icon, to pause and resume.

The first translation

The first time you use a given pair of languages, Chrome downloads the model for it and shows you the progress. After that, the pair works offline and there is nothing left to download.

What it needs

Chrome 138 or later on Windows, macOS, or Linux. Chrome on Android and iOS does not support the built-in translator yet.

About the permissions

The extension asks to run on the pages you visit, because you might highlight text on any of them. It reads only what you select, at the moment you select it. It saves your settings and nothing else, and it makes no network requests of its own.
```

---

# Privacy Practices Tab

These are the answers required before **Submit for review** becomes available.
Reviewers reject vague justifications, so each one names the specific feature
that needs the permission.

## Single Purpose

> Swift Translator has one purpose: to translate text that the user highlights
> on a web page, using Chrome's built-in on-device Translator API, and show the
> result in a small popup next to the selection.

## Permission Justifications

### `storage`

> Used only to save the user's own settings: target language, fallback source
> language, whether auto-detection is enabled, the popup theme, whether the
> popup keeps a fixed position (and where), and whether the extension is
> paused. These are kept in `chrome.storage.sync` so they follow the user
> across their signed-in devices. No browsing history, page content, or
> translated text is ever stored.

### Host permission — `<all_urls>` (content script matches)

> The extension translates text that the user highlights, and the user may
> highlight text on any site they read, so the content script must be able to
> run on all URLs. It stays idle until the user makes a selection: it reads only
> the text the user has highlighted, and only at that moment. It does not scan,
> collect, or transmit page content, and it makes no network requests of any
> kind. Translation is performed locally by Chrome's built-in Translator API.

## Are you using remote code?

**No, I am not using remote code.** All JavaScript and CSS ships inside the
package. There are no remotely hosted scripts, no `eval`, and no external
stylesheets or fonts.

## Data Usage

Select **"This extension does not collect or use user data."**

Then tick all three certifications — all are true for this extension:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Verified in the source:** no `fetch`, no `XMLHttpRequest`, no `WebSocket`,
and no `sendBeacon` anywhere in `src/`, and no remote scripts or stylesheets.
The only external URL in the package is an informational link to Chrome's
Translator API documentation on the settings page, which the user must click
deliberately.

## Screenshots

Generated at 1280x800 from the shipped code. See `docs/screenshots/`.
