# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) that automatically changes a Philips Hue light color when the user joins a Google Meet meeting, and restores the original light state when the meeting ends. Supports both "in meeting" and "warning" states with configurable colors.

## Development

This is a pure JavaScript Chrome extension with no build step. To develop:

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `src/` directory
4. After code changes, click the refresh icon on the extension card

**Icons:** Add icon files to `src/icons/` (16x16, 48x48, 128x128 PNG recommended for Chrome Web Store).

## Architecture

### Module Structure

```
src/
  _locales/
    en/messages.json  # English locale (default)
    fr/messages.json  # French locale
  lib/
    hue-api.js        # Hue bridge communication (ES module)
    storage.js        # Chrome storage wrapper (ES module)
    i18n-init.js      # i18n initialization helper
  scripts/
    meet-detector.js  # Content script (IIFE, not ES module)
  popup/
    popup.html/js     # Extension popup (IIFE)
  settings/
    settings.html/js  # Full settings page (ES module)
  background.js       # Service worker (ES module)
  constants.js        # Constants for content script and popup
  manifest.json
```

### Status Types

The extension tracks three states:
- `STATUS_TYPES.NO_STATUS` - User not on Google Meet
- `STATUS_TYPES.WARNING` - User on Google Meet but not in active call
- `STATUS_TYPES.IN_MEETING` - User in active Google Meet call

### Message Flow

```
Content script (meet-detector.js)
    │
    ▼ MESSAGE_TYPES.STATUS
Background service worker (background.js)
    │
    ▼ MESSAGE_TYPES.STATUS_CHANGED (broadcast)
Popup (popup.js)
```

### Key Design Decisions

- **ES Modules**: Background and settings use ES modules. Content scripts and popup cannot use ES modules, so they load `constants.js` separately.
- **State Persistence**: Meeting/warning status persists in `chrome.storage.session` to survive service worker restarts during long meetings.
- **Debouncing**: MutationObserver in content script is debounced (500ms) to prevent excessive CPU usage on Google Meet.
- **Backup Polling**: 5-second interval check in case MutationObserver misses changes (shadow DOM, etc.).
- **Status Deduplication**: Content script only sends messages when status actually changes.
- **Event-Driven Popup**: Popup listens for `STATUS_CHANGED` broadcasts instead of polling.
- **Internationalization**: Uses Chrome's i18n API with `data-i18n` attributes for HTML and `chrome.i18n.getMessage()` for JS.

### Shared Libraries

**`lib/hue-api.js`**: Hue bridge communication
- `HueClient` class for light control
- `discoverBridge()`, `authenticateBridge()` functions
- IP validation, color conversion helpers
- Retry logic with exponential backoff

**`lib/storage.js`**: Chrome storage abstraction
- `STORAGE_KEYS`, `MESSAGE_TYPES`, `STATUS_TYPES` constants
- Bridge config: `getBridgeConfig()`, `saveBridgeConfig()`, `clearBridgeConfig()`
- Meeting color: `getMeetingColor()`, `saveMeetingColor()`
- Warning color: `getWarningColor()`, `saveWarningColor()`, `getWarningColorEnabled()`
- Session state: `getMeetingStatus()`, `setMeetingStatus()`, `getWarningStatus()`, `setWarningStatus()`
- Light state: `getPreviousLightState()`, `savePreviousLightState()`, `clearPreviousLightState()`

**`lib/i18n-init.js`**: Internationalization helper
- `translatePage()` - Auto-translates elements with `data-i18n`, `data-i18n-placeholder`, `data-i18n-title` attributes
- Called on page load for popup and settings

### Hue API Color Conversion

User-facing values use intuitive ranges (hue: 0-360°, sat/bri: 0-100%) which are converted to Hue API ranges (hue: 0-65535, sat/bri: 0-254) via `hueToApi()` and `percentToApi()` in `lib/hue-api.js`.

### Chrome Storage

- **`chrome.storage.local`**: Persistent config (bridgeIp, username, lightId, meeting color, warning color)
- **`chrome.storage.session`**: Transient state (currentMeetingStatus, currentWarningStatus, previousLightState) - survives service worker restarts but clears on browser close

### Internationalization (i18n)

The extension uses Chrome's built-in i18n API:
- Locale files in `src/_locales/{locale}/messages.json`
- Manifest strings use `__MSG_keyName__` syntax
- HTML elements use `data-i18n="keyName"` attributes (translated by `i18n-init.js`)
- JavaScript uses `chrome.i18n.getMessage('keyName')`

To add a new language, copy `_locales/en/messages.json` to a new folder (e.g., `_locales/es/messages.json`) and translate the `message` fields.

## Code Quality Guidelines

### Constants Management

Constants are defined in multiple places due to Chrome's module loading constraints:
- `lib/storage.js` - ES module version (for background.js, settings.js)
- `constants.js` - IIFE version (for content scripts and popup)

When adding new constants, update both files to keep them in sync.

### Performance Considerations

1. **MutationObserver**: Observes `document.body` with `subtree: true` which is CPU-intensive. Mitigated by:
   - 500ms debounce on DOM changes
   - Early return if status unchanged
   - Backup polling reduced to 5 seconds

2. **Color caching**: Popup caches meeting/warning colors to avoid repeated storage reads

3. **Message deduplication**: Content script only sends messages when status actually changes

### Security Notes

**Host Permissions**: The manifest requires `"http://*/*"` for Hue bridge communication. This is necessary because:
- Hue bridges use HTTP (not HTTPS) on local network IPs
- Bridge IP addresses vary by user's network configuration
- Chrome doesn't support wildcard patterns for private IP ranges

This permission is only used for Hue API calls, never for external requests.

### Chrome Web Store Checklist

Before publishing:
- [ ] Add icons: 16x16, 48x48, 128x128 PNG in `src/icons/`
- [ ] Test in production mode (not just developer mode)
- [ ] Verify all i18n strings have translations
- [ ] Remove any console.log statements (debugging)
- [ ] Test with extension reloaded (simulate updates)
- [ ] Test service worker recovery (close/reopen Chrome during meeting)
- [ ] Prepare privacy policy if required (no user data collected currently)

### Testing Scenarios

1. **Basic flow**: Open Meet → status shows "warning" → join call → status shows "in meeting" → light changes → leave call → light restores
2. **Tab close**: Close Meet tab → status returns to "not in meeting" → light restores
3. **Color changes**: Change color in settings while in meeting → popup updates immediately
4. **Service worker restart**: During long meeting, Chrome may restart service worker → meeting state should persist
5. **Extension reload**: Reload extension while in meeting → should detect current state on next page load
