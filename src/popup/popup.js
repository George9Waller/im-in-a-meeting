/**
 * Popup script for "I'm in a meeting" extension
 * Displays current meeting status
 */

(function() {
  'use strict';

  const statusEl = document.getElementById('status');
  const statusText = statusEl.querySelector('.status-text');
  const settingsBtn = document.getElementById('settingsBtn');

  /**
   * Update the meeting status indicator UI
   * @param {boolean} inMeeting
   */
  function updateMeetingStateIndicator(inMeeting) {
    if (inMeeting) {
      statusEl.className = 'status in-meeting';
      statusText.textContent = 'IN MEETING';
    } else {
      statusEl.className = 'status not-in-meeting';
      statusText.textContent = 'AVAILABLE';
    }
  }

  /**
   * Fetch current meeting state from background script
   */
  async function fetchInitialMeetingState() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_STATUS
      });
      updateMeetingStateIndicator(response.inMeeting);
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
   * Open settings page
   */
  function openSettings() {
    chrome.tabs.create({ url: 'settings/settings.html' });
  }

  // Initialize
  settingsBtn.addEventListener('click', openSettings);
  listenForStatusChanges();
  fetchInitialMeetingState();
})();
