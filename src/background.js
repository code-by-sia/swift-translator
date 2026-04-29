chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "openOptions") {
    chrome.runtime.openOptionsPage();
  }
});
