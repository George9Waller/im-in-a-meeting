/**
 * Content script for detecting Google Meet meeting status
 * Injected into meet.google.com/* pages
 */

(function() {
  'use strict';

  // Configuration
  const DEBOUNCE_DELAY_MS = 500;
  const CHECK_INTERVAL_MS = 2000;

  // State
  let lastKnownStatus = null;
  let debounceTimer = null;
  let observer = null;
  let intervalId = null;
  let isExtensionValid = true;

  /**
   * Check if the user is currently in a meeting
   * Looks for the "call_end" button which is only present during an active call
   * @returns {boolean}
   */
  function isInMeeting() {
    // Use querySelector for better performance than XPath
    // The call_end icon appears in the meeting controls bar when in a call
    const icons = document.querySelectorAll('i.google-symbols');
    for (const icon of icons) {
      if (icon.textContent === 'call_end') {
        return true;
      }
    }
    return false;
  }

  /**
   * Send meeting status to background script
   * @param {boolean} inMeeting
   */
  function sendStatus(inMeeting) {
    if (!isExtensionValid) return;

    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.MEETING_STATUS,
      inMeeting: inMeeting
    }).catch(handleExtensionError);
  }

  /**
   * Handle extension context invalidation
   * @param {Error} error
   */
  function handleExtensionError(error) {
    // Extension was reloaded, disabled, or uninstalled
    if (error.message?.includes('Extension context invalidated') ||
        error.message?.includes('Could not establish connection')) {
      console.log('[MEET-DETECTOR] Extension context invalidated, stopping observer');
      cleanup();
      isExtensionValid = false;
    }
  }

  /**
   * Check meeting status and notify if changed
   * Only sends message when status actually changes (deduplication)
   */
  function checkAndNotify() {
    const inMeeting = isInMeeting();

    // Only send update if status has changed (deduplication)
    if (inMeeting !== lastKnownStatus) {
      lastKnownStatus = inMeeting;
      console.log('[MEET-DETECTOR] Meeting status changed:', inMeeting ? 'IN MEETING' : 'NOT IN MEETING');
      sendStatus(inMeeting);
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
  }

  /**
   * Initialize the meeting detector
   */
  function initialize() {
    // Check immediately on page load
    checkAndNotify();

    // Set up MutationObserver with debouncing
    // Observing body is necessary because Meet dynamically loads the call UI
    observer = new MutationObserver(debouncedCheck);

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Backup: periodic check in case mutations are missed
    // (e.g., if the page uses shadow DOM or other techniques)
    intervalId = setInterval(() => {
      if (isExtensionValid) {
        checkAndNotify();
      }
    }, CHECK_INTERVAL_MS);

    // Clean up when page is unloaded
    window.addEventListener('beforeunload', () => {
      // Ensure we notify that we're leaving
      if (lastKnownStatus === true) {
        sendStatus(false);
      }
      cleanup();
    });

    console.log('[MEET-DETECTOR] Initialized');
  }

  // Start the detector
  initialize();
})();
