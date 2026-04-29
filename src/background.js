chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ isEnabled: true, source: "en", target: "de" });
});

chrome.action.onClicked.addListener(async (tab) => {
  const data = await chrome.storage.sync.get("isEnabled");
  const newState = !data.isEnabled;

  await chrome.storage.sync.set({ isEnabled: newState });

  // Visual feedback on the icon
  chrome.action.setBadgeText({
    text: newState ? "" : "OFF",
  });
  chrome.action.setBadgeBackgroundColor({
    color: "#ff0000",
  });
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "openOptions") {
    chrome.runtime.openOptionsPage();
  }
});
