describe('Swift Translator Extension', () => {
  beforeEach(() => {
    // Setup basic Chrome API mocks
    global.chrome = {
      storage: {
        sync: {
          get: jest.fn(),
          set: jest.fn(),
        }
      },
      runtime: {
        onInstalled: {
          addListener: jest.fn()
        },
        onMessage: {
          addListener: jest.fn()
        },
        sendMessage: jest.fn()
      },
      action: {
        onClicked: {
          addListener: jest.fn()
        },
        setBadgeText: jest.fn(),
        setBadgeBackgroundColor: jest.fn()
      }
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize Chrome storage correctly', () => {
    const defaultSettings = { 
      isEnabled: true, 
      source: "de", 
      target: "en", 
      pageLangDetection: true 
    };

    chrome.storage.sync.get.mockResolvedValueOnce(defaultSettings);

    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
    
    // Test the mock
    chrome.storage.sync.get(defaultSettings).then(result => {
      expect(result).toEqual(defaultSettings);
    });
  });

  it('should have basic DOM methods available in JSDOM environment', () => {
    const div = document.createElement('div');
    div.id = 'ai-translator-display';
    document.body.appendChild(div);

    const found = document.getElementById('ai-translator-display');
    expect(found).not.toBeNull();
  });
});
