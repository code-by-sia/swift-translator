let displayDiv = null;

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

// YOUR SPECIFIC TRANSLATION FUNCTION
async function translateSelection(selectedText) {
  // Note: Ensure chrome://flags/#translation-api is enabled
  const translator = await Translator.create({
    sourceLanguage: "de",
    targetLanguage: "en",
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => {
        console.log(`Downloaded ${e.loaded * 100}%`);
      });
    },
  });
  const result = await translator.translate(selectedText);

  // Optional: Clean up translator if the API supports .destroy()
  if (translator.destroy) translator.destroy();

  return result;
}

function showBox(content) {
  if (!displayDiv) {
    displayDiv = document.createElement("div");
    displayDiv.id = "ai-translator-display";
    Object.assign(displayDiv.style, {
      position: "fixed",
      top: "15px",
      right: "15px",
      width: "300px",
      minHeight: "40px",
      padding: "15px",
      backgroundColor: "#1a73e8",
      color: "#ffffff",
      borderRadius: "8px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
      zIndex: "2147483647", // Maximum possible z-index
      fontFamily: "Segoe UI, Tahoma, sans-serif",
      fontSize: "14px",
      pointerEvents: "auto",
    });
    document.body.appendChild(displayDiv);
  }

  displayDiv.innerText = content;
  displayDiv.style.display = "block";
}
