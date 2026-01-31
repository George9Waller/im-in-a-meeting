/**
 * Content script for detecting Google Meet meeting status
 * Injected into meet.google.com/* pages
 */

(function () {
  'use strict';

  // Configuration
  const DEBOUNCE_DELAY_MS = 500;
  const CHECK_INTERVAL_MS = 5000; // Backup check interval (5 seconds)

  // State
  let lastKnownStatus = null;
  let debounceTimer = null;
  let observer = null;
  let intervalId = null;
  let isExtensionValid = true;

  /**
   * Check if the user is currently in an active meeting
   * Looks for the "call_end" button which only appears during an active call
   * @returns {boolean}
   */
  function isInMeeting() {
    // The call_end icon appears in the meeting controls bar during active calls
    const icons = document.querySelectorAll('i.google-symbols');
    for (const icon of icons) {
      if (icon.textContent === 'call_end') {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if the tab is currently visible/focused
   * @returns {boolean}
   */
  function isTabVisible() {
    return document.visibilityState === 'visible';
  }

  /**
   * Send meeting status to background script
   * @param {string} status - STATUS_TYPES value
   * @param {string|null} previousStatus - Previous STATUS_TYPES value
   */
  function sendStatus(status, previousStatus) {
    if (!isExtensionValid) return;

    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.STATUS,
      status: status,
      previousStatus: previousStatus
    }).catch(handleExtensionError);
  }

  /**
   * Handle extension context invalidation
   * @param {Error} error
   */
  function handleExtensionError(error) {
    if (error.message?.includes('Extension context invalidated') ||
        error.message?.includes('Could not establish connection')) {
      cleanup();
      isExtensionValid = false;
    }
  }

  /**
   * Check meeting status and notify background if changed
   * Implements deduplication - only sends message when status changes
   * Note: Does NOT handle visibility changes - that's done by handleVisibilityChange
   */
  function checkAndNotify() {
    if (!isExtensionValid) return;

    // Skip check if tab is not visible (visibility handled separately)
    if (!isTabVisible()) return;

    const inMeeting = isInMeeting();

    if (inMeeting) {
      // User is in an active meeting
      if (lastKnownStatus !== STATUS_TYPES.IN_MEETING) {
        sendStatus(STATUS_TYPES.IN_MEETING, lastKnownStatus);
        lastKnownStatus = STATUS_TYPES.IN_MEETING;
      }
      return;
    }

    // Tab is visible, not in meeting = warning state
    if (lastKnownStatus !== STATUS_TYPES.WARNING) {
      sendStatus(STATUS_TYPES.WARNING, lastKnownStatus);
      lastKnownStatus = STATUS_TYPES.WARNING;
    }
  }

  /**
   * Handle tab visibility changes (user switching tabs)
   */
  function handleVisibilityChange() {
    if (!isExtensionValid) return;

    if (isTabVisible()) {
      // Tab became visible - check current state
      checkAndNotify();
    } else {
      // Tab became hidden
      // If in WARNING state, clear it (user switched away)
      // If in MEETING, keep it (user is still in meeting, just on another tab)
      if (lastKnownStatus === STATUS_TYPES.WARNING) {
        sendStatus(STATUS_TYPES.NO_STATUS, lastKnownStatus);
        lastKnownStatus = STATUS_TYPES.NO_STATUS;
      }
    }
  }

  /**
   * Debounced version of checkAndNotify
   * Prevents excessive checks during rapid DOM mutations
   */
  function debouncedCheck() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkAndNotify, DEBOUNCE_DELAY_MS);
  }

  /**
   * Clean up observers and timers
   */
  function cleanup() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }

  /**
   * Initialize the meeting detector
   */
  function initialize() {
    // Check immediately on page load (only if tab is visible)
    checkAndNotify();

    // Listen for tab visibility changes (user switching tabs)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Set up MutationObserver with debouncing
    // Observing body is necessary because Meet dynamically loads the call UI
    observer = new MutationObserver(debouncedCheck);

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Backup: periodic check in case mutations are missed
    // (e.g., if Meet uses shadow DOM or other techniques)
    intervalId = setInterval(checkAndNotify, CHECK_INTERVAL_MS);

    // Clean up when page is unloaded
    window.addEventListener('beforeunload', () => {
      // Notify background that we're leaving the Meet page
      if (lastKnownStatus !== null && lastKnownStatus !== STATUS_TYPES.NO_STATUS) {
        sendStatus(STATUS_TYPES.NO_STATUS, lastKnownStatus);
      }
      cleanup();
    });
  }

  // Start the detector
  initialize();
})();
