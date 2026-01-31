/**
 * Popup script for "I'm in a meeting" extension
 * Displays current meeting status with dynamic meeting color
 *
 * Note: MESSAGE_TYPES and STATUS_TYPES are loaded from constants.js (see popup.html)
 */

(function() {
  'use strict';

  // DOM elements
  const statusEl = document.getElementById('status');
  const statusDot = statusEl.querySelector('.status-dot');
  const statusText = statusEl.querySelector('.status-text');
  const settingsBtn = document.getElementById('settingsBtn');

  // Storage keys (not in constants.js since they're storage-specific)
  const STORAGE_KEYS = Object.freeze({
    MEETING_HUE: 'meetingHue',
    MEETING_SAT: 'meetingSat',
    MEETING_BRI: 'meetingBri',
    WARNING_HUE: 'warningColorHue',
    WARNING_SAT: 'warningColorSat',
    WARNING_BRI: 'warningColorBri'
  });

  // Cached colors
  let meetingColor = null;
  let warningColor = null;

  /**
   * Convert HSB values to CSS hsl() string
   * @param {number} hue - 0-360
   * @param {number} sat - 0-100
   * @param {number} bri - 0-100
   * @returns {string} CSS hsl color
   */
  function hsbToHsl(hue, sat, bri) {
    const s = sat / 100;
    const v = bri / 100;

    const l = v * (1 - s / 2);
    const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);

    return `hsl(${hue}, ${Math.round(sl * 100)}%, ${Math.round(l * 100)}%)`;
  }

  /**
   * Generate a darker background color from the hue
   * @param {number} hue - 0-360
   * @returns {string} CSS hsl color for background
   */
  function getStatusBackground(hue) {
    return `hsl(${hue}, 100%, 5%)`;
  }

  /**
   * Fetch the saved meeting color from storage
   * @returns {Promise<{hue: number, sat: number, bri: number}>}
   */
  async function fetchMeetingColor() {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.MEETING_HUE,
      STORAGE_KEYS.MEETING_SAT,
      STORAGE_KEYS.MEETING_BRI
    ]);

    return {
      hue: result[STORAGE_KEYS.MEETING_HUE] ?? 0,
      sat: result[STORAGE_KEYS.MEETING_SAT] ?? 100,
      bri: result[STORAGE_KEYS.MEETING_BRI] ?? 100
    };
  }

  /**
   * Fetch the saved warning color from storage
   * @returns {Promise<{hue: number, sat: number, bri: number}>}
   */
  async function fetchWarningColor() {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.WARNING_HUE,
      STORAGE_KEYS.WARNING_SAT,
      STORAGE_KEYS.WARNING_BRI
    ]);

    return {
      hue: result[STORAGE_KEYS.WARNING_HUE] ?? 0,
      sat: result[STORAGE_KEYS.WARNING_SAT] ?? 100,
      bri: result[STORAGE_KEYS.WARNING_BRI] ?? 100
    };
  }

  /**
   * Apply color styles to the status element
   * @param {{hue: number, sat: number, bri: number}} color
   */
  function applyColorStyles(color) {
    const cssColor = hsbToHsl(color.hue, color.sat, color.bri);
    const bgColor = getStatusBackground(color.hue);

    statusEl.style.borderColor = cssColor;
    statusEl.style.background = bgColor;
    statusDot.style.background = cssColor;
    statusDot.style.boxShadow = `0 0 20px ${cssColor}`;
    statusText.style.color = cssColor;
  }

  /**
   * Clear color styles (reset to CSS defaults)
   */
  function clearColorStyles() {
    statusEl.style.borderColor = '';
    statusEl.style.background = '';
    statusDot.style.background = '';
    statusDot.style.boxShadow = '';
    statusText.style.color = '';
  }

  /**
   * Update the meeting status indicator UI
   * @param {string} status - STATUS_TYPES value
   */
  async function updateStatusIndicator(status) {
    if (status === STATUS_TYPES.IN_MEETING) {
      statusEl.className = 'status in-meeting';
      statusText.textContent = chrome.i18n.getMessage('statusInMeeting');

      if (!meetingColor) {
        meetingColor = await fetchMeetingColor();
      }
      applyColorStyles(meetingColor);

    } else if (status === STATUS_TYPES.WARNING) {
      statusEl.className = 'status warning';
      statusText.textContent = chrome.i18n.getMessage('statusWarning');

      if (!warningColor) {
        warningColor = await fetchWarningColor();
      }
      applyColorStyles(warningColor);

    } else {
      statusEl.className = 'status not-in-meeting';
      statusText.textContent = chrome.i18n.getMessage('statusNotInMeeting');
      clearColorStyles();
    }
  }

  /**
   * Fetch current meeting state from background script
   */
  async function fetchInitialState() {
    try {
      meetingColor = await fetchMeetingColor();

      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_STATUS
      });
      await updateStatusIndicator(response.status);
    } catch (error) {
      statusText.textContent = chrome.i18n.getMessage('statusError');
    }
  }

  /**
   * Listen for status change broadcasts from background script
   */
  function listenForStatusChanges() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === MESSAGE_TYPES.STATUS_CHANGED) {
        updateStatusIndicator(message.status);
      }
    });
  }

  /**
   * Listen for storage changes (in case user updates colors in settings)
   */
  function listenForColorChanges() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;

      // Check if meeting color changed
      const meetingColorChanged =
        STORAGE_KEYS.MEETING_HUE in changes ||
        STORAGE_KEYS.MEETING_SAT in changes ||
        STORAGE_KEYS.MEETING_BRI in changes;

      if (meetingColorChanged) {
        meetingColor = null;
        if (statusEl.classList.contains('in-meeting')) {
          fetchMeetingColor().then(color => {
            meetingColor = color;
            applyColorStyles(color);
          });
        }
      }

      // Check if warning color changed
      const warningColorChanged =
        STORAGE_KEYS.WARNING_HUE in changes ||
        STORAGE_KEYS.WARNING_SAT in changes ||
        STORAGE_KEYS.WARNING_BRI in changes;

      if (warningColorChanged) {
        warningColor = null;
        if (statusEl.classList.contains('warning')) {
          fetchWarningColor().then(color => {
            warningColor = color;
            applyColorStyles(color);
          });
        }
      }
    });
  }

  /**
   * Open settings page
   */
  function openSettings() {
    chrome.tabs.create({ url: 'settings/settings.html' });
  }

  // Initialize
  settingsBtn.addEventListener('click', openSettings);
  listenForStatusChanges();
  listenForColorChanges();
  fetchInitialState();
})();
