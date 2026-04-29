let displayDiv = null;
let isDragging = false;
let offset = { x: 0, y: 0 };

// Listen for mouseup to detect when selection is finished
document.addEventListener("mouseup", async (event) => {
  const selection = window.getSelection().toString().trim();

  // If clicking inside the box, don't trigger a new translation
  if (displayDiv && displayDiv.contains(event.target)) return;

  if (selection.length > 1) {
    showBox("Translating...");
    try {
      const translated = await translateSelection(selection);
      showBox(translated);
    } catch (err) {
      showBox("Error: " + err.message);
      console.error(err);
    }
  } else if (displayDiv) {
    // Hide box if clicking away on empty space
    displayDiv.style.display = "none";
  }
});

async function getSettings() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
    return await chrome.storage.sync.get(["source", "target"]);
  }
  // Fallback if API is missing
  return { source: "de", target: "en" };
}

// YOUR SPECIFIC TRANSLATION FUNCTION
async function translateSelection(selectedText) {
  // Retrieve settings from storage
  const settings = await getSettings();
  const src = settings.source || "de";
  const tgt = settings.target || "en";

  const translator = await Translator.create({
    sourceLanguage: src,
    targetLanguage: tgt,
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => {
        console.log(`Downloaded ${e.loaded * 100}%`);
      });
    },
  });

  const result = await translator.translate(selectedText);
  if (translator.destroy) translator.destroy();
  return result;
}

function showBox(content) {
  if (!displayDiv) {
    displayDiv = document.createElement("div");
    displayDiv.id = "ai-translator-display";

    // Main Box Styling
    Object.assign(displayDiv.style, {
      position: "fixed",
      top: "15px",
      right: "15px",
      width: "300px",
      padding: "15px",
      backgroundColor: "#1a73e8",
      color: "#ffffff",
      borderRadius: "8px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
      zIndex: "2147483647",
      fontFamily: "system-ui, sans-serif",
      cursor: "grab", // Indicates it can be moved
    });

    displayDiv.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "A" || e.target.tagName === "BUTTON") return;
      isDragging = true;
      displayDiv.style.cursor = "grabbing";
      offset.x = e.clientX - displayDiv.getBoundingClientRect().left;
      offset.y = e.clientY - displayDiv.getBoundingClientRect().top;
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      // Calculate new position
      const x = e.clientX - offset.x;
      const y = e.clientY - offset.y;

      // Apply position (removing 'right' and 'top' defaults)
      displayDiv.style.right = "auto";
      displayDiv.style.left = x + "px";
      displayDiv.style.top = y + "px";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      if (displayDiv) displayDiv.style.cursor = "grab";
    });

    // Content area for text
    const textSpan = document.createElement("span");
    textSpan.id = "ai-text-content";
    displayDiv.appendChild(textSpan);

    // Options Link
    const settingsLink = document.createElement("a");
    settingsLink.innerText = "Settings ⚙️";
    Object.assign(settingsLink.style, {
      display: "block",
      marginTop: "10px",
      fontSize: "11px",
      color: "#e8f0fe",
      textDecoration: "none",
      cursor: "pointer",
      opacity: "0", // Hidden by default
      transition: "opacity 0.2s ease",
    });

    // Hover effect: Show link when hovering over the parent div
    displayDiv.onmouseenter = () => (settingsLink.style.opacity = "1");
    displayDiv.onmouseleave = () => (settingsLink.style.opacity = "0");

    settingsLink.onclick = () => {
      // Directs to the options page defined in manifest
      chrome.runtime.sendMessage({ action: "openOptions" });
    };

    displayDiv.appendChild(settingsLink);
    document.body.appendChild(displayDiv);
  }

  document.getElementById("ai-text-content").innerText = content;
  displayDiv.style.display = "block";
}
