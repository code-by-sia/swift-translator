let displayDiv = null;
let isDragging = false;
let offset = { x: 0, y: 0 };

// Listen for mouseup to detect when selection is finished
document.addEventListener("mouseup", async (event) => {
  let settings;
  try {
    settings = await chrome.storage.sync.get({ isEnabled: true, theme: "system", target: "en" });
  } catch (err) {
    if (err.message.includes("Extension context invalidated")) {
      console.warn("Swift Translator: Extension context invalidated. Please refresh the page.");
    }
    return;
  }

  if (settings.isEnabled === false) {
    if (displayDiv) displayDiv.style.display = "none";
    return;
  }
  const theme = settings.theme || "system";
  const targetLang = settings.target || "en";

  const selection = window.getSelection().toString().trim();
  if (displayDiv && displayDiv.contains(event.target)) return;

  if (selection.length > 1) {
    // Hide previous display immediately for a slicker feel
    if (displayDiv) displayDiv.style.display = "none";

    let isFinished = false;
    const loadingTimeout = setTimeout(() => {
      if (!isFinished) {
        showBox("Preparing AI Model...", true, theme, null, targetLang);
      }
    }, 200);

    try {
      const { translated, detectedLang } = await translateSelection(selection);
      isFinished = true;
      clearTimeout(loadingTimeout);
      showBox(translated, false, theme, detectedLang, targetLang);
    } catch (err) {
      isFinished = true;
      clearTimeout(loadingTimeout);
      showBox("Error: " + err.message, false, theme, null, targetLang);
    }
  } else if (displayDiv) {
    displayDiv.style.display = "none";
  }
});

async function getSettings() {
  const defaults = { source: "de", target: "en", pageLangDetection: true, theme: "system" };
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
    try {
      return await chrome.storage.sync.get(defaults);
    } catch (err) {
      if (err.message.includes("Extension context invalidated")) {
        console.warn("Swift Translator: Extension context invalidated. Please refresh the page.");
      }
    }
  }
  // Fallback if API is missing or error occurs
  return defaults;
}

// YOUR SPECIFIC TRANSLATION FUNCTION
async function translateSelection(selectedText) {
  // Check if API is available
  const isTranslatorGlobal = typeof Translator !== "undefined";
  const isTranslationGlobal = typeof translation !== "undefined" && translation.createTranslator;
  
  if (!isTranslatorGlobal && !isTranslationGlobal) {
    throw new Error("Translator API not available. Please update your browser to the latest version and ensure experimental AI features are enabled in chrome://flags.");
  }

  // Retrieve settings from storage
  const settings = await getSettings();
  let src = settings.source || "de";
  const tgt = settings.target || "en";

  let wasDetected = false;

  if (settings.pageLangDetection || src === "auto") {
    try {
      let detectedLangStr = null;

      // Try Chrome Built-in AI language detection first, if available
      if (typeof ai !== "undefined" && ai.languageDetector) {
        try {
          const detector = await ai.languageDetector.create();
          if (detector && detector.ready) await detector.ready;
          if (detector) {
            const results = await detector.detect(selectedText);
            if (results && results.length > 0) {
              detectedLangStr = results[0].detectedLanguage || results[0].language;
            }
          }
        } catch (e) {
          console.warn("AI Language detection failed, falling back to i18n", e);
        }
      }

      // Fallback to Chrome's highly reliable i18n API
      if (!detectedLangStr && chrome && chrome.i18n && chrome.i18n.detectLanguage) {
        const result = await new Promise(resolve => chrome.i18n.detectLanguage(selectedText, resolve));
        if (result && result.languages && result.languages.length > 0) {
          // Always use highest probability match
          detectedLangStr = result.languages[0].language;
        }
      }

      if (detectedLangStr && detectedLangStr !== "unknown" && detectedLangStr !== "und") {
        // Normalize language codes for Translation API
        if (detectedLangStr.startsWith("zh")) {
          src = (detectedLangStr.toLowerCase() === "zh-tw" || detectedLangStr.toLowerCase() === "zh-hant") ? "zh-Hant" : "zh";
        } else {
          src = detectedLangStr.split("-")[0]; // e.g., 'en-US' -> 'en'
        }
        wasDetected = true;
      } else if (src === "auto") {
        src = "de"; // Safe fallback
        wasDetected = true;
      }
    } catch (e) {
      console.warn("Language detection failed entirely", e);
      if (src === "auto") {
        src = "de";
        wasDetected = true;
      }
    }
  }

  // The API throws an error if source and target are the exact same language.
  if (src === tgt) {
    return { translated: selectedText, detectedLang: wasDetected ? src : null };
  }

  let translator;
  try {
    const createFn = isTranslatorGlobal ? Translator.create.bind(Translator) : translation.createTranslator.bind(translation);
    translator = await createFn({
      sourceLanguage: src,
      targetLanguage: tgt,
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          // e.loaded might be bytes or fraction depending on API version, handle both gracefully
          const percent = e.total ? Math.round((e.loaded / e.total) * 100) : Math.round(e.loaded * 100);
          console.log(`Downloaded ${percent}%`);
          
          // Update the UI dynamically
          const loadingText = document.getElementById("ai-loading-text");
          if (loadingText) {
            loadingText.innerText = `Downloading Model: ${percent}%`;
          }
        });
      },
    });
  } catch (err) {
    throw new Error("Failed to initialize translator: " + err.message, { cause: err });
  }

  const result = await translator.translate(selectedText);
  if (translator.destroy) translator.destroy();
  return { translated: result, detectedLang: wasDetected ? src : null };
}

function showBox(content, isLoading = false, theme = "system", detectedLang = null, targetLang = "en") {
  // Determine if dark mode should be applied
  let isDarkMode = false;
  if (theme === "dark") {
    isDarkMode = true;
  } else if (theme === "light") {
    isDarkMode = false;
  } else if (theme === "dynamic") {
    // Dynamic theme: dark if page background/text implies dark mode
    const bodyColor = window.getComputedStyle(document.body).color;
    const match = bodyColor.match(/\d+/g);
    if (match) {
      const r = parseInt(match[0], 10);
      const g = parseInt(match[1], 10);
      const b = parseInt(match[2], 10);
      const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
      isDarkMode = hsp > 127.5; // Bright text usually means dark background
    }
  } else {
    // System Default
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      isDarkMode = true;
    }
  }

  if (!displayDiv) {
    displayDiv = document.createElement("div");
    displayDiv.id = "ai-translator-display";

    // Inject Theme Styles
    const style = document.createElement("style");
    style.innerHTML = `
      #ai-translator-display {
        --ai-bg: rgba(255, 255, 255, 0.8);
        --ai-text: #1e293b;
        --ai-border: rgba(255, 255, 255, 0.5);
        --ai-shadow: rgba(0, 0, 0, 0.1);
        --ai-shadow-sm: rgba(0, 0, 0, 0.05);
        --ai-muted: #64748b;
        --ai-border-light: rgba(0,0,0,0.05);
        --ai-link: #64748b;
      }
      #ai-translator-display[data-theme="dark"] {
        --ai-bg: rgba(15, 23, 42, 0.8);
        --ai-text: #f8fafc;
        --ai-border: rgba(255, 255, 255, 0.1);
        --ai-shadow: rgba(0, 0, 0, 0.5);
        --ai-shadow-sm: rgba(0, 0, 0, 0.2);
        --ai-muted: #94a3b8;
        --ai-border-light: rgba(255,255,255,0.1);
        --ai-link: #cbd5e1;
      }
      .ai-settings-link-hover { transition: color 0.2s ease; color: var(--ai-link); }
      .ai-settings-link-hover:hover { color: #6366f1 !important; }

      #ai-text-content::-webkit-scrollbar {
        width: 6px;
      }
      #ai-text-content::-webkit-scrollbar-track {
        background: transparent;
      }
      #ai-text-content::-webkit-scrollbar-thumb {
        background: var(--ai-border);
        border-radius: 4px;
      }
      #ai-text-content::-webkit-scrollbar-thumb:hover {
        background: var(--ai-muted);
      }
    `;
    document.head.appendChild(style);

    // Main Box Styling using variables
    Object.assign(displayDiv.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      width: "320px",
      minHeight: "100px",
      padding: "20px",
      background: "var(--ai-bg)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      color: "var(--ai-text)",
      borderRadius: "16px",
      border: "1px solid var(--ai-border)",
      boxShadow: "0 10px 40px var(--ai-shadow), 0 1px 3px var(--ai-shadow-sm)",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      cursor: "grab", 
      transition: "opacity 0.3s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      opacity: "0",
      transform: "translateY(-10px) scale(0.95)",
    });
    
    // Force maximum z-index with !important
    displayDiv.style.setProperty("z-index", "2147483647", "important");

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

    // Header with Logo/Title
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "12px",
      fontSize: "13px",
      fontWeight: "600",
      color: "var(--ai-muted)",
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      width: "100%"
    });
    header.innerHTML = `
      <div style="display: flex; align-items: center;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; color: #6366f1;">
          <path d="M5 8l6 6"/>
          <path d="M4 14l6-6 2-3"/>
          <path d="M2 5h12"/>
          <path d="M7 2h1"/>
          <path d="M22 22l-5-10-5 10"/>
          <path d="M14 18h6"/>
        </svg>
      </div>
      <div id="ai-detected-lang" style="
        font-size: 10px;
        background: rgba(99, 102, 241, 0.1);
        color: #6366f1;
        padding: 4px 8px;
        border-radius: 6px;
        display: none;
        letter-spacing: 1px;
        font-weight: 700;
      "></div>
    `;
    displayDiv.appendChild(header);

    // Content area for text
    const textSpan = document.createElement("div");
    textSpan.id = "ai-text-content";
    Object.assign(textSpan.style, {
      fontSize: "15px",
      lineHeight: "1.5",
      fontWeight: "400",
      maxHeight: "300px",
      overflowY: "auto",
      overflowX: "hidden",
      wordWrap: "break-word"
    });
    displayDiv.appendChild(textSpan);

    // Options Link
    const settingsContainer = document.createElement("div");
    Object.assign(settingsContainer.style, {
      position: "absolute",
      bottom: "12px",
      insetInlineEnd: "12px",
      opacity: "0",
      transition: "opacity 0.2s ease",
    });

    const settingsLink = document.createElement("a");
    settingsLink.className = "ai-settings-link-hover";
    settingsLink.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
      Settings
    `;
    Object.assign(settingsLink.style, {
      display: "flex",
      alignItems: "center",
      fontSize: "12px",
      fontWeight: "500",
      textDecoration: "none",
      cursor: "pointer",
    });

    // Hover effect: Show link when hovering over the parent div
    displayDiv.onmouseenter = () => (settingsContainer.style.opacity = "1");
    displayDiv.onmouseleave = () => (settingsContainer.style.opacity = "0");

    settingsLink.onclick = () => {
      try {
        chrome.runtime.sendMessage({ action: "openOptions" });
      } catch (err) {
        if (err.message && err.message.includes("Extension context invalidated")) {
          alert("Swift Translator was updated. Please refresh the page to access settings.");
        }
      }
    };

    settingsContainer.appendChild(settingsLink);
    displayDiv.appendChild(settingsContainer);
    document.body.appendChild(displayDiv);
  }

  // Determine direction based on target language
  const rtlLangs = ['ar', 'iw', 'he', 'fa', 'ur', 'ps'];
  const isRTL = rtlLangs.includes(targetLang.toLowerCase());
  const dirAttr = isRTL ? 'rtl' : 'ltr';

  // Dynamically update theme attribute and direction
  displayDiv.setAttribute("data-theme", isDarkMode ? "dark" : "light");
  displayDiv.setAttribute("dir", dirAttr);

  const langPill = document.getElementById("ai-detected-lang");
  if (langPill) {
    if (detectedLang) {
      langPill.innerText = `Detected: ${detectedLang.toUpperCase()}`;
      langPill.style.display = "block";
    } else {
      langPill.style.display = "none";
    }
  }

  const textContainer = document.getElementById("ai-text-content");
  
  if (isLoading) {
    textContainer.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; color: #6366f1;">
        <svg class="ai-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="2" x2="12" y2="6"></line>
          <line x1="12" y1="18" x2="12" y2="22"></line>
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
          <line x1="2" y1="12" x2="6" y2="12"></line>
          <line x1="18" y1="12" x2="22" y2="12"></line>
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
        </svg>
        <span id="ai-loading-text" style="font-weight: 500;">${content}</span>
      </div>
      <style>
        @keyframes ai-spin { 100% { transform: rotate(360deg); } }
        .ai-spin { animation: ai-spin 1s linear infinite; }
      </style>
    `;
  } else {
    const sanitizedContent = content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    textContainer.innerHTML = `
      <div class="ai-text-wrapper" style="animation: ai-fade-in-up 0.4s ease-out; position: relative;">
        <div class="ai-translated-text" style="
          font-size: 15px;
          line-height: 1.6;
          font-weight: 500;
          letter-spacing: 0.2px;
          color: inherit;
          word-break: break-word;
        ">${sanitizedContent}</div>
        <button id="ai-copy-btn" title="Copy translation" style="
          position: absolute;
          top: -2px;
          inset-inline-end: -4px;
          background: transparent;
          border: none;
          cursor: pointer;
          color: #94a3b8;
          padding: 6px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
      <style>
        @keyframes ai-fade-in-up {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        #ai-copy-btn {
          opacity: 0;
          pointer-events: none;
        }
        .ai-text-wrapper:hover #ai-copy-btn {
          opacity: 1;
          pointer-events: auto;
        }
        #ai-copy-btn:hover {
          color: #6366f1 !important;
          background: rgba(99, 102, 241, 0.1) !important;
        }
      </style>
    `;

    // Attach copy to clipboard functionality
    const copyBtn = document.getElementById("ai-copy-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(content).then(() => {
          // Show checkmark on success
          copyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          copyBtn.style.color = "#10b981";
          
          // Revert back after 2 seconds
          setTimeout(() => {
            copyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
            copyBtn.style.color = "#94a3b8";
          }, 2000);
        }).catch(err => {
          console.error("Failed to copy text: ", err);
        });
      });
    }
  }

  displayDiv.style.display = "block";
  
  // Trigger reflow to ensure animation works
  void displayDiv.offsetWidth;
  
  displayDiv.style.opacity = "1";
  displayDiv.style.transform = "translateY(0) scale(1)";
}
