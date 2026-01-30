# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) that automatically changes a Philips Hue light color when the user joins a Google Meet meeting, and restores the original light state when the meeting ends.

## Development

This is a pure JavaScript Chrome extension with no build step. To develop:

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `src/` directory
4. After code changes, click the refresh icon on the extension card

**Note:** You need to add icon files (`icon16.png`, `icon48.png`, `icon128.png`) to `src/icons/` before loading.

## Architecture

### Module Structure

```
src/
  lib/
    hue-api.js     # Hue bridge communication (ES module)
    storage.js     # Chrome storage wrapper (ES module)
  scripts/
    meet-detector.js  # Content script (IIFE, not ES module)
  popup/
    popup.html/js     # Extension popup
  settings/
    settings.html/js  # Full settings page (ES module)
  background.js       # Service worker (ES module)
  constants.js        # Constants for content script only
  manifest.json
```

### Message Flow

```
Content script (meet-detector.js)
    │
    ▼ MESSAGE_TYPES.MEETING_STATUS
Background service worker (background.js)
    │
    ▼ MESSAGE_TYPES.STATUS_CHANGED (broadcast)
Popup (popup.js)
```

### Key Design Decisions

- **ES Modules**: Background, popup, and settings use ES modules. Content scripts cannot use ES modules, so `meet-detector.js` is a self-contained IIFE.
- **State Persistence**: Meeting status persists in `chrome.storage.session` to survive service worker restarts during long meetings.
- **Debouncing**: MutationObserver in content script is debounced (500ms) to prevent excessive CPU usage on Google Meet.
- **Status Deduplication**: Content script only sends messages when meeting status actually changes.
- **Event-Driven Popup**: Popup listens for `STATUS_CHANGED` broadcasts instead of polling.

### Shared Libraries

**`lib/hue-api.js`**: Hue bridge communication
- `HueClient` class for light control
- `discoverBridge()`, `authenticateBridge()` functions
- IP validation, color conversion helpers
- Retry logic with exponential backoff

**`lib/storage.js`**: Chrome storage abstraction
- `STORAGE_KEYS` and `MESSAGE_TYPES` constants
- Bridge config: `getBridgeConfig()`, `saveBridgeConfig()`, `clearBridgeConfig()`
- Meeting color: `getMeetingColor()`, `saveMeetingColor()`
- Session state: `getMeetingStatus()`, `setMeetingStatus()`, `getPreviousLightState()`, `savePreviousLightState()`

### Hue API Color Conversion

User-facing values use intuitive ranges (hue: 0-360°, sat/bri: 0-100%) which are converted to Hue API ranges (hue: 0-65535, sat/bri: 0-254) via `hueToApi()` and `percentToApi()` in `lib/hue-api.js`.

### Chrome Storage

- **`chrome.storage.local`**: Persistent config (bridgeIp, username, lightId, meeting color)
- **`chrome.storage.session`**: Transient state (currentMeetingStatus, previousLightState) - survives service worker restarts but clears on browser close
