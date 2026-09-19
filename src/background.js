const DEFAULT_SETTINGS = {
  isEnabled: true,
  source: "auto",
  target: "en",
  pageLangDetection: true,
  theme: "system",
};

// `onInstalled` also fires on every extension update, so writing the whole
// defaults object here would reset the user's saved languages each time they
// receive a new version. Only fill in keys that are actually missing.
async function seedDefaults() {
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const missing = {};
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (stored[key] === undefined) missing[key] = value;
  }
  if (Object.keys(missing).length > 0) {
    await chrome.storage.sync.set(missing);
  }
  return missing;
}

// Badge text is not persisted across browser restarts, so it has to be
// re-derived from storage whenever the service worker starts up.
async function syncBadge() {
  const { isEnabled } = await chrome.storage.sync.get({ isEnabled: true });
  await chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
  await chrome.action.setBadgeText({ text: isEnabled ? "" : "OFF" });
  await chrome.action.setTitle({
    title: isEnabled
      ? "Swift Translator is on — click to pause"
      : "Swift Translator is paused — click to resume",
  });
}

async function toggleEnabled() {
  const { isEnabled } = await chrome.storage.sync.get({ isEnabled: true });
  await chrome.storage.sync.set({ isEnabled: !isEnabled });
  await syncBadge();
}

chrome.runtime.onInstalled.addListener(async () => {
  await seedDefaults();
  await syncBadge();
});

chrome.runtime.onStartup.addListener(() => {
  syncBadge();
});

chrome.action.onClicked.addListener(() => {
  toggleEnabled();
});

if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === "toggle-translator") toggleEnabled();
  });
}

chrome.runtime.onMessage.addListener((request) => {
  if (request && request.action === "openOptions") {
    chrome.runtime.openOptionsPage();
  }
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = { DEFAULT_SETTINGS, seedDefaults, syncBadge, toggleEnabled };
}
