/**
 * Popup script for "I'm in a meeting" extension
 * Displays current meeting status with dynamic meeting color
 */

(function() {
  'use strict';

  const statusEl = document.getElementById('status');
  const statusDot = statusEl.querySelector('.status-dot');
  const statusText = statusEl.querySelector('.status-text');
  const settingsBtn = document.getElementById('settingsBtn');

  // Storage keys (duplicated here since popup doesn't use ES modules)
  const STORAGE_KEYS = {
    MEETING_HUE: 'meetingHue',
    MEETING_SAT: 'meetingSat',
    MEETING_BRI: 'meetingBri'
  };

  // Cached meeting color
  let meetingColor = null;

  /**
   * Convert HSB values to CSS hsl() string
   * @param {number} hue - 0-360
   * @param {number} sat - 0-100
   * @param {number} bri - 0-100
   * @returns {string} CSS hsl color
   */
  function hsbToHsl(hue, sat, bri) {
    // HSB to HSL conversion
    // In HSB, brightness is the max RGB value
    // In HSL, lightness is the average of max and min RGB
    const s = sat / 100;
    const v = bri / 100;

    const l = v * (1 - s / 2);
    const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);

    return `hsl(${hue}, ${Math.round(sl * 100)}%, ${Math.round(l * 100)}%)`;
  }

  /**
   * Generate a darker background color from the meeting color
   * @param {number} hue - 0-360
   * @returns {string} CSS hsl color for background
   */
  function getMeetingBackground(hue) {
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
   * Apply meeting color styles to the status element
   * @param {{hue: number, sat: number, bri: number}} color
   */
  function applyMeetingColorStyles(color) {
    const cssColor = hsbToHsl(color.hue, color.sat, color.bri);
    const bgColor = getMeetingBackground(color.hue);

    statusEl.style.borderColor = cssColor;
    statusEl.style.background = bgColor;
    statusDot.style.background = cssColor;
    statusDot.style.boxShadow = `0 0 20px ${cssColor}`;
    statusText.style.color = cssColor;
  }

  /**
   * Clear meeting color styles (reset to CSS defaults)
   */
  function clearMeetingColorStyles() {
    statusEl.style.borderColor = '';
    statusEl.style.background = '';
    statusDot.style.background = '';
    statusDot.style.boxShadow = '';
    statusText.style.color = '';
  }

  /**
   * Update the meeting status indicator UI
   * @param {boolean} inMeeting
   */
  async function updateMeetingStateIndicator(inMeeting) {
    if (inMeeting) {
      statusEl.className = 'status in-meeting';
      statusText.textContent = 'IN MEETING';

      // Fetch and apply the meeting color
      if (!meetingColor) {
        meetingColor = await fetchMeetingColor();
      }
      applyMeetingColorStyles(meetingColor);
    } else {
      statusEl.className = 'status not-in-meeting';
      statusText.textContent = 'AVAILABLE';
      clearMeetingColorStyles();
    }
  }

  /**
   * Fetch current meeting state from background script
   */
  async function fetchInitialMeetingState() {
    try {
      // Pre-fetch meeting color
      meetingColor = await fetchMeetingColor();

      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_STATUS
      });
      await updateMeetingStateIndicator(response.inMeeting);
    } catch (error) {
      console.error('[POPUP] Error fetching meeting state:', error);
      statusText.textContent = 'ERROR';
    }
  }

  /**
   * Listen for status change broadcasts from background script
   */
  function listenForStatusChanges() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === MESSAGE_TYPES.STATUS_CHANGED) {
        updateMeetingStateIndicator(message.inMeeting);
      }
    });
  }

  /**
   * Listen for storage changes (in case user updates meeting color)
   */
  function listenForColorChanges() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;

      const colorChanged =
        STORAGE_KEYS.MEETING_HUE in changes ||
        STORAGE_KEYS.MEETING_SAT in changes ||
        STORAGE_KEYS.MEETING_BRI in changes;

      if (colorChanged) {
        // Invalidate cache and re-apply if in meeting
        meetingColor = null;
        if (statusEl.classList.contains('in-meeting')) {
          fetchMeetingColor().then(color => {
            meetingColor = color;
            applyMeetingColorStyles(color);
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
  fetchInitialMeetingState();
})();
