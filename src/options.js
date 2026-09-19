const DEFAULTS = {
  source: "auto",
  target: "en",
  pageLangDetection: true,
  theme: "system",
};

// Legacy ISO codes that used to be stored but are not valid Translator API
// codes. Map them so existing users keep their language after an update.
const LANG_ALIASES = { iw: "he", in: "id", ji: "yi" };

const $ = (id) => document.getElementById(id);

function canonical(code) {
  if (typeof code !== "string") return code;
  return LANG_ALIASES[code.toLowerCase()] || code;
}

function syncSourceDisabledState() {
  $("src-group").classList.toggle("disabled", $("pageLangDetection").checked);
}

function showStatus(message, isError = false) {
  const status = $("status");
  status.textContent = message;
  status.classList.toggle("error", isError);
  status.classList.add("show");
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => status.classList.remove("show"), 2500);
}

/* ------------------------------------------------------------------ *
 * Model availability
 * ------------------------------------------------------------------ */

function effectiveSource() {
  const selected = canonical($("src").value);
  if (selected && selected !== "auto") return selected;
  // With auto-detect there is no fixed source, so report on the browser's
  // own language as a representative pair.
  const uiLang = (navigator.language || "en").split("-")[0].toLowerCase();
  return canonical(uiLang);
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

function renderProgress(pairLabel, percent) {
  const indeterminate = percent === null || percent === undefined;
  const value = indeterminate ? 0 : clampPercent(percent);
  setModelStatus(
    "Downloading the " +
      pairLabel +
      " model&hellip;" +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"' +
      (indeterminate ? "" : ' aria-valuenow="' + value + '"') +
      (indeterminate ? ' data-indeterminate="true"' : "") +
      ">" +
      '<div class="progress-track"><div class="progress-fill" style="width:' +
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
  const pair =
    "<strong>" +
    source.toUpperCase() +
    " &rarr; " +
    target.toUpperCase() +
    "</strong>";

  if (typeof Translator === "undefined" || !Translator.availability) {
    setModelStatus(
      "Chrome's built-in translator isn't available in this browser. Update Chrome, then enable it at <code>chrome://flags/#translation-api</code>.",
    );
    return;
  }

  if (source === target) {
    setModelStatus(
      "Source and target are the same &mdash; nothing to translate for " + pair + ".",
    );
    return;
  }

  let availability;
  try {
    availability = await Translator.availability({
      sourceLanguage: source,
      targetLanguage: target,
    });
  } catch {
    setModelStatus("Couldn't check the model for " + pair + ".");
    return;
  }

  if (availability === "available") {
    setModelStatus("&#10003; " + pair + " model is installed and runs offline.");
  } else if (availability === "downloading") {
    setModelStatus(pair + " model is downloading&hellip;");
  } else if (availability === "downloadable") {
    setModelStatus(
      pair +
        " model isn't downloaded yet. <button type=\"button\" id=\"download-model\" class=\"link-btn\">Download now</button>",
    );
    $("download-model").addEventListener("click", downloadModel);
  } else {
    setModelStatus("Chrome can't translate " + pair + " yet.");
  }
}

async function downloadModel() {
  const source = effectiveSource();
  const target = canonical($("target").value);
  const pairLabel =
    "<strong>" +
    source.toUpperCase() +
    " &rarr; " +
    target.toUpperCase() +
    "</strong>";
  renderProgress(pairLabel, null);
  try {
    const translator = await Translator.create({
      sourceLanguage: source,
      targetLanguage: target,
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => {
          renderProgress(pairLabel, computeDownloadPercent(event));
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
      showStatus("Couldn't load your settings.", true);
      return;
    }
    $("src").value = canonical(data.source) || "auto";
    $("target").value = canonical(data.target) || "en";
    $("theme").value = data.theme || "system";
    $("pageLangDetection").checked = data.pageLangDetection !== false;
    syncSourceDisabledState();
    refreshModelStatus();
  });
}

function save() {
  const settings = {
    source: $("src").value || "auto",
    target: $("target").value || "en",
    pageLangDetection: $("pageLangDetection").checked,
    theme: $("theme").value || "system",
  };

  chrome.storage.sync.set(settings, () => {
    if (chrome.runtime.lastError) {
      showStatus(
        "Couldn't save: " + chrome.runtime.lastError.message,
        true,
      );
      return;
    }
    showStatus("Settings saved successfully!");
    refreshModelStatus();
  });
}

$("save").addEventListener("click", save);
$("pageLangDetection").addEventListener("change", () => {
  syncSourceDisabledState();
  refreshModelStatus();
});
$("src").addEventListener("change", refreshModelStatus);
$("target").addEventListener("change", refreshModelStatus);

load();
