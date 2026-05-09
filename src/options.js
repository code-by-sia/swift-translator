document.getElementById("save").addEventListener("click", () => {
  const source = document.getElementById("src").value || "de";
  const target = document.getElementById("target").value || "en";
  const pageLangDetection = document.getElementById("pageLangDetection").checked;
  const theme = document.getElementById("theme").value || "system";

  chrome.storage.sync.set({ source, target, pageLangDetection, theme }, () => {
    const status = document.getElementById("status");
    status.classList.add("show");
    
    // Hide after 2 seconds
    setTimeout(() => {
      status.classList.remove("show");
    }, 2000);
  });
});

// Update UI when toggle changes
document.getElementById("pageLangDetection").addEventListener("change", (e) => {
  const srcGroup = document.getElementById("src-group");
  if (e.target.checked) {
    srcGroup.classList.add("disabled");
  } else {
    srcGroup.classList.remove("disabled");
  }
});

// Load existing settings on open
chrome.storage.sync.get(["source", "target", "pageLangDetection", "theme"], (data) => {
  if (data.source) document.getElementById("src").value = data.source;
  if (data.target) document.getElementById("target").value = data.target;
  if (data.theme) document.getElementById("theme").value = data.theme;
  
  const pageLangDetection = document.getElementById("pageLangDetection");
  const srcGroup = document.getElementById("src-group");

  if (data.pageLangDetection !== undefined) {
    pageLangDetection.checked = data.pageLangDetection;
  } else {
    // Default to false if not set
    pageLangDetection.checked = false;
  }

  // Set initial disabled state
  if (pageLangDetection.checked) {
    srcGroup.classList.add("disabled");
  } else {
    srcGroup.classList.remove("disabled");
  }
});
