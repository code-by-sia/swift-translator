const CONTENT = require.resolve("../src/content.js");
const BACKGROUND = require.resolve("../src/background.js");

function loadContent() {
  // content.js only wires up listeners when the extension APIs are present,
  // so leaving `chrome` undefined gives us the pure helpers on their own.
  delete global.chrome;
  let mod;
  jest.isolateModules(() => {
    mod = require(CONTENT);
  });
  return mod;
}

function makeChrome(stored = {}) {
  const listeners = {};
  const capture = (name) => ({
    addListener: jest.fn((fn) => {
      listeners[name] = fn;
    }),
  });
  const chrome = {
    __listeners: listeners,
    __stored: { ...stored },
    storage: {
      sync: {
        get: jest.fn(async (keys) => {
          const result = {};
          if (Array.isArray(keys)) {
            for (const key of keys) {
              if (chrome.__stored[key] !== undefined) {
                result[key] = chrome.__stored[key];
              }
            }
          } else {
            for (const [key, fallback] of Object.entries(keys)) {
              result[key] =
                chrome.__stored[key] === undefined
                  ? fallback
                  : chrome.__stored[key];
            }
          }
          return result;
        }),
        set: jest.fn(async (values) => {
          Object.assign(chrome.__stored, values);
        }),
      },
      onChanged: capture("storageChanged"),
    },
    runtime: {
      onInstalled: capture("installed"),
      onStartup: capture("startup"),
      onMessage: capture("message"),
      openOptionsPage: jest.fn(),
    },
    action: {
      onClicked: capture("clicked"),
      setBadgeText: jest.fn(async () => {}),
      setBadgeBackgroundColor: jest.fn(async () => {}),
      setTitle: jest.fn(async () => {}),
    },
    commands: { onCommand: capture("command") },
  };
  return chrome;
}

function loadBackground(stored) {
  global.chrome = makeChrome(stored);
  let mod;
  jest.isolateModules(() => {
    mod = require(BACKGROUND);
  });
  return { background: mod, chrome: global.chrome };
}

afterEach(() => {
  jest.clearAllMocks();
  delete global.chrome;
});

describe("language code normalisation", () => {
  const { normalizeLangCode, isRTL } = loadContent();

  it("strips regional subtags", () => {
    expect(normalizeLangCode("en-US")).toBe("en");
    expect(normalizeLangCode("pt-BR")).toBe("pt");
  });

  it("keeps traditional Chinese distinct from simplified", () => {
    expect(normalizeLangCode("zh-TW")).toBe("zh-Hant");
    expect(normalizeLangCode("zh-Hant")).toBe("zh-Hant");
    expect(normalizeLangCode("zh-CN")).toBe("zh");
  });

  it("maps legacy ISO codes the Translator API rejects", () => {
    expect(normalizeLangCode("iw")).toBe("he");
    expect(normalizeLangCode("in")).toBe("id");
  });

  it("treats unknown and auto as 'no language'", () => {
    expect(normalizeLangCode("und")).toBeNull();
    expect(normalizeLangCode("unknown")).toBeNull();
    expect(normalizeLangCode("auto")).toBeNull();
    expect(normalizeLangCode("")).toBeNull();
    expect(normalizeLangCode(undefined)).toBeNull();
  });

  it("detects right-to-left targets under both Hebrew codes", () => {
    expect(isRTL("ar")).toBe(true);
    expect(isRTL("he")).toBe(true);
    expect(isRTL("iw")).toBe(true);
    expect(isRTL("fa-IR")).toBe(true);
    expect(isRTL("en")).toBe(false);
    expect(isRTL(null)).toBe(false);
  });
});

describe("popup positioning", () => {
  const { clampToViewport } = loadContent();

  it("keeps the popup fully on screen", () => {
    expect(clampToViewport(-200, -200, 320, 120, 1000, 800)).toEqual({
      x: 8,
      y: 8,
    });
    expect(clampToViewport(5000, 5000, 320, 120, 1000, 800)).toEqual({
      x: 672,
      y: 672,
    });
  });

  it("leaves an in-bounds position untouched", () => {
    expect(clampToViewport(100, 100, 320, 120, 1000, 800)).toEqual({
      x: 100,
      y: 100,
    });
  });

  it("still yields a usable position when the popup is larger than the viewport", () => {
    const pos = clampToViewport(0, 0, 320, 900, 300, 400);
    expect(pos.x).toBeGreaterThanOrEqual(8);
    expect(pos.y).toBeGreaterThanOrEqual(8);
  });
});

describe("selection handling", () => {
  const { truncateSelection, MAX_SELECTION_CHARS, isContextInvalidated } =
    loadContent();

  it("trims whitespace and reports nothing selected", () => {
    expect(truncateSelection("   \n  ")).toEqual({ text: "", truncated: false });
  });

  it("caps very large selections", () => {
    const huge = "a".repeat(MAX_SELECTION_CHARS + 500);
    const result = truncateSelection(huge);
    expect(result.text).toHaveLength(MAX_SELECTION_CHARS);
    expect(result.truncated).toBe(true);
  });

  it("leaves a single character intact", () => {
    expect(truncateSelection("字")).toEqual({ text: "字", truncated: false });
  });

  it("recognises an invalidated extension context", () => {
    expect(
      isContextInvalidated(new Error("Extension context invalidated.")),
    ).toBe(true);
    expect(isContextInvalidated(new Error("network error"))).toBe(false);
    expect(isContextInvalidated(null)).toBe(false);
  });
});

describe("model download progress", () => {
  const { computeDownloadPercent, clampPercent } = loadContent();

  it("uses loaded/total when a total is reported", () => {
    expect(computeDownloadPercent({ loaded: 512, total: 2048 })).toBe(25);
    expect(computeDownloadPercent({ loaded: 2048, total: 2048 })).toBe(100);
    expect(computeDownloadPercent({ loaded: 0, total: 2048 })).toBe(0);
  });

  it("treats a totalless 0-1 loaded value as a fraction", () => {
    expect(computeDownloadPercent({ loaded: 0.42 })).toBe(42);
    expect(computeDownloadPercent({ loaded: 1 })).toBe(100);
  });

  it("goes indeterminate when the payload is unusable", () => {
    // Raw byte counts with no total can't become a percentage.
    expect(computeDownloadPercent({ loaded: 90112 })).toBeNull();
    expect(computeDownloadPercent({ loaded: 512, total: 0 })).toBeNull();
    expect(computeDownloadPercent({ loaded: -1 })).toBeNull();
    expect(computeDownloadPercent({ loaded: NaN })).toBeNull();
    expect(computeDownloadPercent({})).toBeNull();
    expect(computeDownloadPercent(null)).toBeNull();
  });

  it("never reports a percentage outside 0-100", () => {
    expect(computeDownloadPercent({ loaded: 5000, total: 2048 })).toBe(100);
    expect(clampPercent(-20)).toBe(0);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(42.6)).toBe(43);
  });
});

describe("background defaults", () => {
  it("seeds defaults on a fresh install", async () => {
    const { background, chrome } = loadBackground({});
    await background.seedDefaults();
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      background.DEFAULT_SETTINGS,
    );
  });

  it("does not overwrite saved settings when the extension updates", async () => {
    const saved = {
      isEnabled: false,
      source: "fr",
      target: "ja",
      pageLangDetection: false,
      theme: "dark",
    };
    const { background, chrome } = loadBackground(saved);
    await background.seedDefaults();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(chrome.__stored).toEqual(saved);
  });

  it("only fills in the keys that are missing", async () => {
    const { background, chrome } = loadBackground({ target: "ja" });
    await background.seedDefaults();
    const written = chrome.storage.sync.set.mock.calls[0][0];
    expect(written).not.toHaveProperty("target");
    expect(written).toHaveProperty("source");
    expect(chrome.__stored.target).toBe("ja");
  });
});

describe("toolbar badge", () => {
  it("restores the OFF badge from storage, not just on click", async () => {
    const { background, chrome } = loadBackground({ isEnabled: false });
    await background.syncBadge();
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "OFF" });
  });

  it("clears the badge when enabled", async () => {
    const { background, chrome } = loadBackground({ isEnabled: true });
    await background.syncBadge();
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
  });

  it("flips state and badge together", async () => {
    const { background, chrome } = loadBackground({ isEnabled: true });
    await background.toggleEnabled();
    expect(chrome.__stored.isEnabled).toBe(false);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "OFF" });
  });

  it("registers a startup listener so the badge survives a restart", () => {
    const { chrome } = loadBackground({ isEnabled: false });
    expect(chrome.runtime.onStartup.addListener).toHaveBeenCalled();
    expect(typeof chrome.__listeners.startup).toBe("function");
  });
});
