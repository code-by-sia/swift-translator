const DEFAULT_SETTINGS = {
  isEnabled: true,
  source: "auto",
  target: "en",
  pageLangDetection: true,
  theme: "system",
};

const MAX_SELECTION_CHARS = 4000;
const LOADING_DELAY_MS = 200;
const MAX_CACHED_TRANSLATORS = 3;
const MIN_DETECTION_CONFIDENCE = 0.4;
const EDGE_MARGIN = 8;
const RTL_LANGS = ["ar", "fa", "he", "iw", "ps", "ur", "yi"];
// Legacy ISO codes that Chrome's Translator API does not accept.
const LANG_ALIASES = { iw: "he", in: "id", ji: "yi" };

let settings = { ...DEFAULT_SETTINGS };
let settingsReady = Promise.resolve(settings);
let requestSeq = 0;
let ui = null;
let userMovedBox = false;
let detectorPromise = null;
let downloadState = null;
let currentAnchor = null;
let activeSeq = null;
const translators = new Map();

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

function normalizeLangCode(code) {
  if (typeof code !== "string") return null;
  const lower = code.trim().toLowerCase();
  if (!lower || lower === "und" || lower === "unknown" || lower === "auto") {
    return null;
  }
  if (lower.startsWith("zh")) {
    return lower === "zh-tw" || lower === "zh-hk" || lower === "zh-hant"
      ? "zh-Hant"
      : "zh";
  }
  const base = lower.split("-")[0];
  return LANG_ALIASES[base] || base;
}

function isRTL(lang) {
  if (typeof lang !== "string") return false;
  return RTL_LANGS.includes(lang.trim().toLowerCase().split("-")[0]);
}

function clampToViewport(x, y, width, height, viewW, viewH, margin = EDGE_MARGIN) {
  const maxX = Math.max(margin, viewW - width - margin);
  const maxY = Math.max(margin, viewH - height - margin);
  return {
    x: Math.min(Math.max(x, margin), maxX),
    y: Math.min(Math.max(y, margin), maxY),
  };
}

function truncateSelection(text, limit = MAX_SELECTION_CHARS) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length <= limit) return { text: trimmed, truncated: false };
  return { text: trimmed.slice(0, limit), truncated: true };
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

// `downloadprogress` has changed shape between Chrome versions: it may report
// bytes with a total, or `loaded` as a 0-1 fraction with no total at all.
// Anything we can't turn into a percentage drives an indeterminate bar.
function computeDownloadPercent(event) {
  if (!event || typeof event.loaded !== "number") return null;
  if (!Number.isFinite(event.loaded) || event.loaded < 0) return null;
  if (typeof event.total === "number" && event.total > 0) {
    return clampPercent((event.loaded / event.total) * 100);
  }
  if (event.loaded <= 1) return clampPercent(event.loaded * 100);
  return null;
}

function isContextInvalidated(err) {
  return Boolean(
    err &&
      typeof err.message === "string" &&
      err.message.includes("Extension context invalidated"),
  );
}

/* ------------------------------------------------------------------ *
 * Settings (read once, then kept fresh via storage events)
 * ------------------------------------------------------------------ */

async function loadSettings() {
  try {
    settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  } catch (err) {
    if (!isContextInvalidated(err)) {
      console.warn("Swift Translator: could not read settings", err);
    }
  }
  return settings;
}

function watchSettings() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    let languagesChanged = false;
    for (const [key, change] of Object.entries(changes)) {
      if (!(key in DEFAULT_SETTINGS)) continue;
      settings[key] = change.newValue;
      if (key === "source" || key === "target") languagesChanged = true;
    }
    if (languagesChanged) releaseTranslators();
    if (settings.isEnabled === false) hideBox();
  });
}

/* ------------------------------------------------------------------ *
 * Translation
 * ------------------------------------------------------------------ */

function getTranslatorApi() {
  if (typeof Translator !== "undefined" && Translator.create) {
    return {
      create: (options) => Translator.create(options),
      availability: Translator.availability
        ? (options) => Translator.availability(options)
        : null,
    };
  }
  // Origin-trial era API, kept for older Chrome builds.
  if (typeof translation !== "undefined" && translation.createTranslator) {
    return {
      create: (options) => translation.createTranslator(options),
      availability: null,
    };
  }
  return null;
}

async function detectWithLanguageDetector(text) {
  if (typeof LanguageDetector === "undefined" || !LanguageDetector.create) {
    return null;
  }
  if (!detectorPromise) {
    detectorPromise = LanguageDetector.create();
    detectorPromise.catch(() => {
      detectorPromise = null;
    });
  }
  const detector = await detectorPromise;
  const results = await detector.detect(text);
  const best = Array.isArray(results) ? results[0] : null;
  if (!best) return null;
  if (
    typeof best.confidence === "number" &&
    best.confidence < MIN_DETECTION_CONFIDENCE
  ) {
    return null;
  }
  return normalizeLangCode(best.detectedLanguage || best.language);
}

async function detectWithLegacyAi(text) {
  if (typeof ai === "undefined" || !ai.languageDetector) return null;
  const detector = await ai.languageDetector.create();
  if (detector && detector.ready) await detector.ready;
  const results = await detector.detect(text);
  const best = Array.isArray(results) ? results[0] : null;
  if (!best) return null;
  return normalizeLangCode(best.detectedLanguage || best.language);
}

async function detectWithI18n(text) {
  if (!chrome.i18n || !chrome.i18n.detectLanguage) return null;
  const result = await new Promise((resolve) =>
    chrome.i18n.detectLanguage(text, resolve),
  );
  const best = result && result.languages && result.languages[0];
  if (!best) return null;
  // `percentage` is 0-100. Short selections are often flagged unreliable even
  // when the top guess is right, so trust a clear majority either way.
  if (typeof best.percentage === "number" && best.percentage < 50) return null;
  return normalizeLangCode(best.language);
}

async function detectLanguage(text) {
  for (const detect of [
    detectWithLanguageDetector,
    detectWithLegacyAi,
    detectWithI18n,
  ]) {
    try {
      const lang = await detect(text);
      if (lang) return lang;
    } catch (err) {
      if (isContextInvalidated(err)) return null;
      console.warn("Swift Translator: language detection step failed", err);
    }
  }
  return null;
}

async function resolveSourceLanguage(text) {
  const fallback = settings.source || "auto";
  if (settings.pageLangDetection || fallback === "auto") {
    const detected = await detectLanguage(text);
    if (detected) return { lang: detected, detected: true };
  }
  return { lang: normalizeLangCode(fallback), detected: false };
}

// Creating a translator warms up a model, so reuse it across selections
// instead of building and destroying one per translation.
function getTranslator(api, sourceLanguage, targetLanguage) {
  const key = sourceLanguage + ">" + targetLanguage;
  const cached = translators.get(key);
  if (cached) {
    translators.delete(key);
    translators.set(key, cached);
    return cached;
  }

  const pending = api.create({
    sourceLanguage,
    targetLanguage,
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        reportDownloadProgress(
          computeDownloadPercent(event),
          sourceLanguage,
          targetLanguage,
        );
      });
    },
  });

  translators.set(key, pending);
  pending.then(
    () => {
      downloadState = null;
    },
    () => {
      downloadState = null;
      translators.delete(key);
    },
  );

  while (translators.size > MAX_CACHED_TRANSLATORS) {
    const oldestKey = translators.keys().next().value;
    const oldest = translators.get(oldestKey);
    translators.delete(oldestKey);
    destroyTranslator(oldest);
  }
  return pending;
}

function destroyTranslator(pending) {
  Promise.resolve(pending)
    .then((translator) => {
      if (translator && typeof translator.destroy === "function") {
        translator.destroy();
      }
    })
    .catch(() => {});
}

function releaseTranslators() {
  for (const pending of translators.values()) destroyTranslator(pending);
  translators.clear();
}

class TranslatorError extends Error {}

async function translateSelection(text) {
  const api = getTranslatorApi();
  if (!api) {
    throw new TranslatorError(
      "Chrome's built-in translator isn't available here. Update Chrome, then enable the Translation API at chrome://flags/#translation-api.",
    );
  }

  const target = normalizeLangCode(settings.target) || "en";
  const { lang: source, detected } = await resolveSourceLanguage(text);

  if (!source) {
    throw new TranslatorError(
      "Couldn't work out what language this is. Pick a fallback language in Settings.",
    );
  }
  if (source === target) {
    return { translated: null, sameLanguage: true, source, detected, target };
  }

  if (api.availability) {
    let status;
    try {
      status = await api.availability({
        sourceLanguage: source,
        targetLanguage: target,
      });
    } catch {
      status = null;
    }
    if (status === "unavailable") {
      throw new TranslatorError(
        "Chrome can't translate " +
          source.toUpperCase() +
          " → " +
          target.toUpperCase() +
          " yet.",
      );
    }
  }

  let translator;
  try {
    translator = await getTranslator(api, source, target);
  } catch (err) {
    throw new TranslatorError(
      "Couldn't load the " +
        source.toUpperCase() +
        " → " +
        target.toUpperCase() +
        " model. " +
        (err && err.message ? err.message : ""),
    );
  }

  const translated = await translator.translate(text);
  return { translated, sameLanguage: false, source, detected, target };
}

/* ------------------------------------------------------------------ *
 * UI — rendered inside a shadow root so page CSS can't reach in
 * ------------------------------------------------------------------ */

const BOX_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :host { all: initial; }
  .box {
    --bg: rgba(255, 255, 255, 0.86);
    --text: #1e293b;
    --border: rgba(15, 23, 42, 0.08);
    --muted: #64748b;
    --accent: #6366f1;
    --shadow: rgba(15, 23, 42, 0.18);
    width: 320px;
    max-width: calc(100vw - 16px);
    padding: 14px 16px 16px;
    background: var(--bg);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: 0 10px 40px var(--shadow);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      Helvetica, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.5;
    text-align: start;
    cursor: grab;
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
    transition: opacity 0.18s ease, transform 0.18s ease;
  }
  .box[data-visible="true"] { opacity: 1; transform: none; }
  .box[data-dragging="true"] { cursor: grabbing; transition: none; }
  .box[data-theme="dark"] {
    --bg: rgba(15, 23, 42, 0.88);
    --text: #f8fafc;
    --border: rgba(255, 255, 255, 0.12);
    --muted: #94a3b8;
    --accent: #a5b4fc;
    --shadow: rgba(0, 0, 0, 0.55);
  }
  .header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
  }
  .brand { display: flex; color: var(--accent); }
  .pill {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.8px;
    padding: 3px 7px;
    border-radius: 6px;
    background: rgba(99, 102, 241, 0.14);
    color: var(--accent);
    white-space: nowrap;
  }
  .pill[hidden] { display: none; }
  .spacer { flex: 1; }
  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    transition: color 0.15s ease, background 0.15s ease;
  }
  .icon-btn:hover { color: var(--accent); background: rgba(99, 102, 241, 0.12); }
  .icon-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .icon-btn[hidden] { display: none; }
  .content {
    max-height: 300px;
    overflow-y: auto;
    overflow-x: hidden;
    overflow-wrap: break-word;
    cursor: auto;
    user-select: text;
  }
  .content::-webkit-scrollbar { width: 6px; }
  .content::-webkit-scrollbar-track { background: transparent; }
  .content::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }
  .content::-webkit-scrollbar-thumb:hover { background: var(--muted); }
  .translation { font-weight: 500; letter-spacing: 0.2px; white-space: pre-wrap; }
  .note {
    margin-top: 8px;
    font-size: 12px;
    color: var(--muted);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 500;
    color: var(--accent);
  }
  .status.error { color: var(--muted); align-items: flex-start; }
  .spinner { animation: spin 1s linear infinite; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .progress { margin-top: 12px; }
  .progress[hidden] { display: none; }
  .progress-track {
    height: 6px;
    border-radius: 999px;
    background: rgba(99, 102, 241, 0.18);
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    width: 0%;
    border-radius: 999px;
    background: var(--accent);
    transition: width 0.25s ease;
  }
  .progress-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 6px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .progress[data-indeterminate="true"] .progress-meta { visibility: hidden; }
  .progress[data-indeterminate="true"] .progress-fill {
    width: 40%;
    transition: none;
    animation: progress-slide 1.3s ease-in-out infinite;
  }
  @keyframes progress-slide {
    0% { transform: translateX(-110%); }
    100% { transform: translateX(260%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .box { transition: none; }
    .spinner { animation: none; }
    .progress-fill { transition: none; animation: none; }
    .progress[data-indeterminate="true"] .progress-fill { width: 100%; }
  }
`;

const ICON_BRAND = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>`;
const ICON_COPY = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_CHECK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICON_GEAR = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const ICON_CLOSE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const ICON_SPINNER = `<svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`;
const ICON_WARN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

function buildUI() {
  const host = document.createElement("div");
  host.id = "swift-translator-root";
  host.style.setProperty("all", "initial", "important");
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("top", "20px", "important");
  host.style.setProperty("left", "20px", "important");
  host.style.setProperty("z-index", "2147483647", "important");
  host.style.setProperty("display", "block", "important");

  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = BOX_STYLES;

  const box = document.createElement("div");
  box.className = "box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Swift Translator");
  box.innerHTML =
    '<div class="header">' +
    '<span class="brand">' +
    ICON_BRAND +
    "</span>" +
    '<span class="pill" hidden></span>' +
    '<span class="spacer"></span>' +
    '<button class="icon-btn copy" type="button" title="Copy translation" aria-label="Copy translation" hidden>' +
    ICON_COPY +
    "</button>" +
    '<button class="icon-btn settings" type="button" title="Settings" aria-label="Settings">' +
    ICON_GEAR +
    "</button>" +
    '<button class="icon-btn close" type="button" title="Close (Esc)" aria-label="Close">' +
    ICON_CLOSE +
    "</button>" +
    "</div>" +
    '<div class="content" aria-live="polite"></div>';

  root.append(style, box);
  document.documentElement.appendChild(host);

  const parts = {
    host,
    box,
    pill: box.querySelector(".pill"),
    copyBtn: box.querySelector(".copy"),
    settingsBtn: box.querySelector(".settings"),
    closeBtn: box.querySelector(".close"),
    content: box.querySelector(".content"),
    lastTranslation: "",
  };

  parts.closeBtn.addEventListener("click", hideBox);
  parts.settingsBtn.addEventListener("click", openOptions);
  parts.copyBtn.addEventListener("click", () => copyTranslation(parts));
  attachDragging(parts);
  return parts;
}

function ensureUI() {
  if (ui && ui.host.isConnected) return ui;
  ui = buildUI();
  return ui;
}

function attachDragging(parts) {
  let offsetX = 0;
  let offsetY = 0;

  const onMove = (event) => {
    const rect = parts.box.getBoundingClientRect();
    const pos = clampToViewport(
      event.clientX - offsetX,
      event.clientY - offsetY,
      rect.width,
      rect.height,
      window.innerWidth,
      window.innerHeight,
    );
    parts.host.style.setProperty("left", pos.x + "px", "important");
    parts.host.style.setProperty("top", pos.y + "px", "important");
  };

  const onUp = () => {
    parts.box.removeAttribute("data-dragging");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };

  parts.box.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    // Let people select the translated text and click the buttons.
    if (event.target.closest(".content, .icon-btn")) return;
    const rect = parts.box.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    userMovedBox = true;
    parts.box.setAttribute("data-dragging", "true");
    event.preventDefault();
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function openOptions() {
  try {
    chrome.runtime.sendMessage({ action: "openOptions" });
  } catch (err) {
    if (isContextInvalidated(err)) {
      alert(
        "Swift Translator was updated. Refresh the page to open its settings.",
      );
    }
  }
}

async function copyTranslation(parts) {
  const text = parts.lastTranslation;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    if (!copyWithFallback(text)) return;
  }
  parts.copyBtn.innerHTML = ICON_CHECK;
  setTimeout(() => {
    parts.copyBtn.innerHTML = ICON_COPY;
  }, 2000);
}

// navigator.clipboard is blocked on some pages (no focus, restrictive
// permissions policy); fall back to the old selection-based copy.
function copyWithFallback(text) {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:-1000px;opacity:0;";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function parseColor(value) {
  const parts = typeof value === "string" ? value.match(/[\d.]+/g) : null;
  if (!parts || parts.length < 3) return null;
  const alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
  if (alpha === 0) return null;
  return {
    r: parseInt(parts[0], 10),
    g: parseInt(parts[1], 10),
    b: parseInt(parts[2], 10),
  };
}

function perceivedBrightness(color) {
  return Math.sqrt(
    0.299 * color.r * color.r +
      0.587 * color.g * color.g +
      0.114 * color.b * color.b,
  );
}

function shouldUseDarkTheme(theme) {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (theme === "dynamic") {
    for (const element of [document.body, document.documentElement]) {
      if (!element) continue;
      const bg = parseColor(window.getComputedStyle(element).backgroundColor);
      if (bg) return perceivedBrightness(bg) < 127.5;
    }
    // Everything is transparent — fall back to reading the text colour.
    const text = document.body
      ? parseColor(window.getComputedStyle(document.body).color)
      : null;
    if (text) return perceivedBrightness(text) > 127.5;
    return false;
  }
  return Boolean(
    window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
}

function getSelectionAnchor() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;
  return { left: rect.left, top: rect.top, bottom: rect.bottom };
}

function positionBox(parts, anchor) {
  if (userMovedBox || !anchor) return;
  const rect = parts.box.getBoundingClientRect();
  let y = anchor.bottom + 12;
  if (y + rect.height > window.innerHeight - EDGE_MARGIN) {
    y = anchor.top - rect.height - 12;
  }
  const pos = clampToViewport(
    anchor.left,
    y,
    rect.width,
    rect.height,
    window.innerWidth,
    window.innerHeight,
  );
  parts.host.style.setProperty("left", pos.x + "px", "important");
  parts.host.style.setProperty("top", pos.y + "px", "important");
}

function showBox(parts, anchor) {
  parts.host.style.setProperty("display", "block", "important");
  parts.box.setAttribute(
    "data-theme",
    shouldUseDarkTheme(settings.theme || "system") ? "dark" : "light",
  );
  positionBox(parts, anchor);
  // Force a reflow so the entry transition runs on first paint.
  void parts.box.offsetWidth;
  parts.box.setAttribute("data-visible", "true");
}

function hideBox() {
  if (!ui || !ui.host.isConnected) return;
  ui.box.removeAttribute("data-visible");
  ui.host.style.setProperty("display", "none", "important");
}

function applyDownloadProgress(parts, state) {
  const progress = parts.content.querySelector(".progress");
  if (!progress || !state) return;

  const label = parts.content.querySelector(".status-text");
  if (label) label.textContent = "Downloading language model…";

  const pair = parts.content.querySelector(".progress-pair");
  if (pair && state.source && state.target) {
    pair.textContent =
      state.source.toUpperCase() + " → " + state.target.toUpperCase();
  }

  const fill = progress.querySelector(".progress-fill");
  const value = progress.querySelector(".progress-percent");
  progress.hidden = false;

  if (state.percent === null || state.percent === undefined) {
    progress.setAttribute("data-indeterminate", "true");
    progress.removeAttribute("aria-valuenow");
    fill.style.width = "";
    value.textContent = "";
    return;
  }

  const percent = clampPercent(state.percent);
  progress.removeAttribute("data-indeterminate");
  progress.setAttribute("aria-valuenow", String(percent));
  fill.style.width = percent + "%";
  value.textContent = percent + "%";
}

// The download can start reporting before the 200 ms loading delay elapses,
// so this also opens the popup if it is not on screen yet.
function reportDownloadProgress(percent, source, target) {
  downloadState = { percent, source, target };
  const showing = ui && ui.host.isConnected && ui.content.querySelector(".progress");
  if (showing) {
    applyDownloadProgress(ui, downloadState);
  } else if (activeSeq !== null && activeSeq === requestSeq) {
    renderLoading(currentAnchor, "Downloading language model…");
  }
}

function renderLoading(anchor, message) {
  const parts = ensureUI();
  parts.pill.hidden = true;
  parts.copyBtn.hidden = true;
  parts.lastTranslation = "";
  parts.content.innerHTML =
    '<div class="status">' +
    ICON_SPINNER +
    '<span class="status-text"></span></div>' +
    '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" hidden>' +
    '<div class="progress-track"><div class="progress-fill"></div></div>' +
    '<div class="progress-meta">' +
    '<span class="progress-pair"></span>' +
    '<span class="progress-percent"></span>' +
    "</div></div>";
  parts.content.querySelector(".status-text").textContent = message;
  parts.box.setAttribute("dir", "ltr");
  if (downloadState) applyDownloadProgress(parts, downloadState);
  showBox(parts, anchor);
}

function renderError(anchor, message) {
  const parts = ensureUI();
  parts.pill.hidden = true;
  parts.copyBtn.hidden = true;
  parts.lastTranslation = "";
  parts.content.innerHTML =
    '<div class="status error">' +
    ICON_WARN +
    '<span class="status-text"></span></div>';
  parts.content.querySelector(".status-text").textContent = message;
  parts.box.setAttribute("dir", "ltr");
  showBox(parts, anchor);
}

function renderTranslation(anchor, result, truncated) {
  const parts = ensureUI();
  parts.lastTranslation = result.translated;

  if (result.detected) {
    parts.pill.textContent = result.source.toUpperCase() + " → " + result.target.toUpperCase();
    parts.pill.hidden = false;
  } else {
    parts.pill.hidden = true;
  }

  parts.content.textContent = "";
  const text = document.createElement("div");
  text.className = "translation";
  // textContent, not innerHTML: the model's output is never treated as markup.
  text.textContent = result.translated;
  parts.content.appendChild(text);

  if (truncated) {
    const note = document.createElement("div");
    note.className = "note";
    note.textContent =
      "Only the first " + MAX_SELECTION_CHARS + " characters were translated.";
    parts.content.appendChild(note);
  }

  parts.copyBtn.hidden = false;
  parts.copyBtn.innerHTML = ICON_COPY;
  parts.box.setAttribute("dir", isRTL(result.target) ? "rtl" : "ltr");
  parts.content.scrollTop = 0;
  showBox(parts, anchor);
}

/* ------------------------------------------------------------------ *
 * Event wiring
 * ------------------------------------------------------------------ */

async function handleMouseUp(event) {
  // Clicks inside the popup are retargeted to the shadow host.
  if (ui && ui.host.isConnected && ui.host.contains(event.target)) return;

  await settingsReady;
  if (settings.isEnabled === false) {
    hideBox();
    return;
  }

  const raw = window.getSelection();
  const { text, truncated } = truncateSelection(raw ? raw.toString() : "");
  if (!text) {
    hideBox();
    return;
  }

  const seq = ++requestSeq;
  activeSeq = seq;
  const anchor = getSelectionAnchor();
  currentAnchor = anchor;

  const loadingTimer = setTimeout(() => {
    if (seq === requestSeq) renderLoading(anchor, "Preparing AI model…");
  }, LOADING_DELAY_MS);

  try {
    const result = await translateSelection(text);
    if (seq !== requestSeq) return;
    if (result.sameLanguage || !result.translated) {
      hideBox();
      return;
    }
    renderTranslation(anchor, result, truncated);
  } catch (err) {
    if (seq !== requestSeq) return;
    if (isContextInvalidated(err)) {
      hideBox();
      console.warn(
        "Swift Translator: extension context invalidated. Refresh the page.",
      );
      return;
    }
    renderError(
      anchor,
      err instanceof TranslatorError
        ? err.message
        : "Translation failed: " + (err && err.message ? err.message : "unknown error"),
    );
  } finally {
    clearTimeout(loadingTimer);
    if (activeSeq === seq) activeSeq = null;
  }
}

function init() {
  settingsReady = loadSettings();
  watchSettings();

  document.addEventListener("mouseup", (event) => {
    handleMouseUp(event).catch((err) => {
      if (!isContextInvalidated(err)) {
        console.warn("Swift Translator: unexpected failure", err);
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      requestSeq += 1; // cancel anything in flight
      userMovedBox = false;
      hideBox();
    }
  });

  window.addEventListener("pagehide", releaseTranslators);
}

if (
  typeof chrome !== "undefined" &&
  chrome.storage &&
  chrome.storage.sync &&
  typeof document !== "undefined"
) {
  init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_SETTINGS,
    MAX_SELECTION_CHARS,
    normalizeLangCode,
    isRTL,
    clampToViewport,
    truncateSelection,
    isContextInvalidated,
    clampPercent,
    computeDownloadPercent,
  };
}
