document.getElementById("save").addEventListener("click", () => {
  const source = document.getElementById("src").value || "de";
  const target = document.getElementById("target").value || "en";

  chrome.storage.sync.set({ source, target }, () => {
    alert("Settings saved!");
  });
});

// Load existing settings on open
chrome.storage.sync.get(["source", "target"], (data) => {
  if (data.source) document.getElementById("src").value = data.source;
  if (data.target) document.getElementById("target").value = data.target;
});
