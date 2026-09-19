const DEFAULTS = {
  source: "auto",
  target: "en",
  pageLangDetection: true,
  theme: "system",
  pinPosition: false,
};

// Legacy ISO codes that used to be stored but are not valid Translator API
// codes. Map them so existing users keep their language after an update.
const LANG_ALIASES = { iw: "he", in: "id", ji: "yi" };

const LANGUAGES = [
  ["ar", "Arabic"], ["bn", "Bengali"], ["bg", "Bulgarian"],
  ["zh", "Chinese (Simplified)"], ["zh-Hant", "Chinese (Traditional)"],
  ["hr", "Croatian"], ["cs", "Czech"], ["da", "Danish"], ["nl", "Dutch"],
  ["en", "English"], ["fi", "Finnish"], ["fr", "French"], ["de", "German"],
  ["el", "Greek"], ["he", "Hebrew"], ["hi", "Hindi"], ["hu", "Hungarian"],
  ["id", "Indonesian"], ["it", "Italian"], ["ja", "Japanese"],
  ["kn", "Kannada"], ["ko", "Korean"], ["lt", "Lithuanian"], ["mr", "Marathi"],
  ["no", "Norwegian"], ["pl", "Polish"], ["pt", "Portuguese"],
  ["ro", "Romanian"], ["ru", "Russian"], ["sk", "Slovak"], ["sl", "Slovenian"],
  ["es", "Spanish"], ["sv", "Swedish"], ["ta", "Tamil"], ["te", "Telugu"],
  ["th", "Thai"], ["tr", "Turkish"], ["uk", "Ukrainian"], ["vi", "Vietnamese"],
];

const $ = (id) => document.getElementById(id);

function canonical(code) {
  if (typeof code !== "string") return code;
  return LANG_ALIASES[code.toLowerCase()] || code;
}

function fillSelect(select, includeAuto) {
  const options = includeAuto
    ? [["auto", "Detect automatically"], ...LANGUAGES]
    : LANGUAGES;
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
}

function syncPositionHint() {
  const fixed = $("pinPosition").value === "fixed";
  $("position-hint").textContent = fixed
    ? "Drag the popup once; it reopens there from then on."
    : "Appears next to the text you highlight.";
}

function syncSourceDisabledState() {
  $("src-group").classList.toggle("is-dimmed", $("pageLangDetection").checked);
}

function showStatus(message, isError = false) {
  const status = $("status");
  status.textContent = message;
  status.classList.toggle("error", isError);
  status.classList.add("show");
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => status.classList.remove("show"), 1800);
}

/* ------------------------------------------------------------------ *
 * Model availability
 * ------------------------------------------------------------------ */

function effectiveSource() {
  const selected = canonical($("src").value);
  if (selected && selected !== "auto") return selected;
  // With auto-detect there is no fixed source, so report on the browser's
  // own language as a representative pair.
  return canonical((navigator.language || "en").split("-")[0].toLowerCase());
}

function setModelStatus(html) {
  $("model-status").innerHTML = html;
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

// `downloadprogress` reports either bytes with a total, or `loaded` as a 0-1
// fraction with no total. Anything else drives an indeterminate bar.
function computeDownloadPercent(event) {
  if (!event || typeof event.loaded !== "number") return null;
  if (!Number.isFinite(event.loaded) || event.loaded < 0) return null;
  if (typeof event.total === "number" && event.total > 0) {
    return clampPercent((event.loaded / event.total) * 100);
  }
  if (event.loaded <= 1) return clampPercent(event.loaded * 100);
  return null;
}

function pairLabel(source, target) {
  return (
    "<strong>" +
    source.toUpperCase() +
    " &rarr; " +
    target.toUpperCase() +
    "</strong>"
  );
}

function renderProgress(label, percent) {
  const indeterminate = percent === null || percent === undefined;
  const value = indeterminate ? 0 : clampPercent(percent);
  setModelStatus(
    "Downloading the " +
      label +
      " model&hellip;" +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"' +
      (indeterminate ? ' data-indeterminate="true"' : ' aria-valuenow="' + value + '"') +
      '><div class="progress-track"><div class="progress-fill" style="width:' +
      value +
      '%"></div></div>' +
      '<div class="progress-meta"><span>Keep this page open</span><span>' +
      value +
      "%</span></div></div>",
  );
}

async function refreshModelStatus() {
  const source = effectiveSource();
  const target = canonical($("target").value);
  const label = pairLabel(source, target);

  if (typeof Translator === "undefined" || !Translator.availability) {
    setModelStatus(
      "Chrome's built-in translator isn't available in this browser. It needs <strong>Chrome 138 or later on desktop</strong>; mobile Chrome doesn't support it.",
    );
    return;
  }

  if (source === target) {
    setModelStatus("Nothing to translate for " + label + ".");
    return;
  }

  let availability;
  try {
    availability = await Translator.availability({
      sourceLanguage: source,
      targetLanguage: target,
    });
  } catch {
    setModelStatus("Couldn't check the model for " + label + ".");
    return;
  }

  if (availability === "available") {
    setModelStatus(label + " is installed and works offline.");
  } else if (availability === "downloading") {
    setModelStatus(label + " is downloading&hellip;");
  } else if (availability === "downloadable") {
    setModelStatus(
      label +
        ' is not downloaded yet. <button type="button" id="download-model" class="link-btn">Download now</button>',
    );
    $("download-model").addEventListener("click", downloadModel);
  } else {
    setModelStatus("Chrome can't translate " + label + " yet.");
  }
}

async function downloadModel() {
  const source = effectiveSource();
  const target = canonical($("target").value);
  const label = pairLabel(source, target);
  renderProgress(label, null);
  try {
    const translator = await Translator.create({
      sourceLanguage: source,
      targetLanguage: target,
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => {
          renderProgress(label, computeDownloadPercent(event));
        });
      },
    });
    if (translator && typeof translator.destroy === "function") {
      translator.destroy();
    }
  } catch (err) {
    setModelStatus(
      "Download failed: " + (err && err.message ? err.message : "unknown error"),
    );
    return;
  }
  refreshModelStatus();
}

/* ------------------------------------------------------------------ *
 * Load / save
 * ------------------------------------------------------------------ */

function load() {
  chrome.storage.sync.get(DEFAULTS, (data) => {
    if (chrome.runtime.lastError) {
      showStatus("Couldn't load your settings", true);
      return;
    }
    $("src").value = canonical(data.source) || "auto";
    $("target").value = canonical(data.target) || "en";
    $("theme").value = data.theme || "system";
    $("pageLangDetection").checked = data.pageLangDetection !== false;
    $("pinPosition").value = data.pinPosition === true ? "fixed" : "follow";
    syncPositionHint();
    syncSourceDisabledState();
    refreshModelStatus();
  });
}

function save() {
  chrome.storage.sync.set(
    {
      source: $("src").value || "auto",
      target: $("target").value || "en",
      pageLangDetection: $("pageLangDetection").checked,
      theme: $("theme").value || "system",
      pinPosition: $("pinPosition").value === "fixed",
    },
    () => {
      if (chrome.runtime.lastError) {
        showStatus("Couldn't save: " + chrome.runtime.lastError.message, true);
        return;
      }
      showStatus("Saved");
      refreshModelStatus();
    },
  );
}

fillSelect($("src"), true);
fillSelect($("target"), false);

for (const id of ["src", "target", "theme", "pageLangDetection", "pinPosition"]) {
  $(id).addEventListener("change", () => {
    if (id === "pageLangDetection") syncSourceDisabledState();
    if (id === "pinPosition") {
      syncPositionHint();
      // Switching back to follow-the-selection clears the remembered spot.
      if ($("pinPosition").value === "follow") {
        chrome.storage.sync.remove(["popupX", "popupY"]);
      }
    }
    save();
  });
}

load();
