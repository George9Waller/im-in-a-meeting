/**
 * Background service worker for "I'm in a meeting" extension
 * Manages meeting state and Hue light control
 */

import { HueClient, hueToApi, percentToApi } from './lib/hue-api.js';
import {
  MESSAGE_TYPES,
  STATUS_TYPES,
  getBridgeConfig,
  getMeetingColor,
  getMeetingStatus,
  setMeetingStatus,
  getPreviousLightState,
  savePreviousLightState,
  clearPreviousLightState,
  getWarningStatus,
  setWarningStatus,
  getWarningColor,
  getStatus
} from './lib/storage.js';

/**
 * Broadcast meeting status change to all extension pages (popup, etc.)
 * @param {string STATUS_TYPES} status
 */
function broadcastStatusChange(status) {
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.STATUS_CHANGED,
    status: status
  }).catch(() => {
    // Popup may not be open, ignore errors
  });
}

/**
 * Handle transition to "in meeting" state
 * @param {boolean} savePreviousLightState
 */
async function handleSetInMeeting(savePreviousLightState) {
  const currentStatus = await getMeetingStatus();
  if (currentStatus === true) return; // Already in meeting

  console.log('[BACKGROUND] Joining meeting, saving light state and setting meeting color');

  await setMeetingStatus(true);
  await setWarningStatus(false);
  broadcastStatusChange(STATUS_TYPES.IN_MEETING);

  let saved = false;
  if (savePreviousLightState === true) {
    saved = await saveLightState();
  }
  if (savePreviousLightState === false || saved) {
    await setLightToMeetingColor();
  }
}

/**
 * Handle transition to "warning" state
 * @param {boolean} savePreviousLightState
 */
async function handleSetWarning(savePreviousLightState) {
  const currentStatus = await getWarningStatus();
  if (currentStatus === true) return; // Already in warning state

  console.log('[BACKGROUND] Joining meeting, saving light state and setting warning color');

  await setMeetingStatus(false);
  await setWarningStatus(true);
  broadcastStatusChange(STATUS_TYPES.WARNING);

  let saved = false;
  if (savePreviousLightState === true) {
    saved = await saveLightState();
  }
  if (savePreviousLightState === false || saved) {
    await setLightToWarningColor();
  }
}

/**
 * Handle transition to "not in meeting" state
 */
async function handleSetNotInMeeting() {
  const [meetingStatus, warningStatus] = await Promise.all([
    getMeetingStatus(),
    getWarningStatus()
  ]);

  // Already in NO_STATUS state (neither meeting nor warning)
  if (meetingStatus === false && warningStatus === false) return;

  console.log('[BACKGROUND] Leaving meeting/warning, restoring light state');

  await setMeetingStatus(false);
  await setWarningStatus(false);
  broadcastStatusChange(STATUS_TYPES.NO_STATUS);

  await restoreLightState();
}

/**
 * Handle transition to "warning" state
 * Records state and transitions to warning state if not already in a meeting
 */

/**
 * Create a HueClient from stored configuration
 * @returns {Promise<{client: HueClient, lightId: string} | null>}
 */
async function getHueClient() {
  const config = await getBridgeConfig();

  if (!config.bridgeIp || !config.username || !config.lightId) {
    console.warn('[BACKGROUND] Hue not fully configured:', {
      hasBridgeIp: !!config.bridgeIp,
      hasUsername: !!config.username,
      hasLightId: !!config.lightId
    });
    return null;
  }

  const client = new HueClient(config.bridgeIp, config.username);

  if (!client.isConfigured()) {
    console.error('[BACKGROUND] Invalid Hue configuration');
    return null;
  }

  return { client, lightId: config.lightId };
}

/**
 * Save current light state before changing to meeting color
 * @returns {Promise<boolean>}
 */
async function saveLightState() {
  const hue = await getHueClient();
  if (!hue) return false;

  const state = await hue.client.getLightState(hue.lightId);
  if (!state) {
    console.error('[BACKGROUND] Failed to get current light state');
    return false;
  }

  await savePreviousLightState(state);
  console.log('[BACKGROUND] Saved light state:', state);
  return true;
}

/**
 * Set light to configured meeting color
 * @returns {Promise<boolean>}
 */
async function setLightToMeetingColor() {
  const hue = await getHueClient();
  if (!hue) return false;

  const meetingColor = await getMeetingColor();

  // Convert from user-facing ranges to Hue API ranges
  const apiState = {
    on: true,
    hue: hueToApi(meetingColor.hue),
    sat: percentToApi(meetingColor.sat),
    bri: percentToApi(meetingColor.bri)
  };

  console.log('[BACKGROUND] Setting meeting color:', {
    userColor: meetingColor,
    apiState
  });

  const success = await hue.client.setLightState(hue.lightId, apiState);

  if (success) {
    console.log('[BACKGROUND] Light set to meeting color');
  } else {
    console.error('[BACKGROUND] Failed to set meeting color');
  }

  return success;
}

/**
 * Set light to configured warning color
 * @returns {Promise<boolean>}
 */
async function setLightToWarningColor() {
  const hue = await getHueClient();
  if (!hue) return false;

  const warningColor = await getWarningColor();
  // Convert from user-facing ranges to Hue API ranges
  const apiState = {
    on: true,
    hue: hueToApi(warningColor.hue),
    sat: percentToApi(warningColor.sat),
    bri: percentToApi(warningColor.bri)
  };

  console.log('[BACKGROUND] Setting warning color:', {
    userColor: warningColor,
    apiState
  });

  const success = await hue.client.setLightState(hue.lightId, apiState);

  if (success) {
    console.log('[BACKGROUND] Light set to warning color');
  } else {
    console.error('[BACKGROUND] Failed to set warning color');
  }

  return success;
}

/**
 * Restore light to previously saved state
 * @returns {Promise<boolean>}
 */
async function restoreLightState() {
  const hue = await getHueClient();
  if (!hue) return false;

  const previousState = await getPreviousLightState();

  if (!previousState) {
    console.log('[BACKGROUND] No previous state to restore');
    return false;
  }

  console.log('[BACKGROUND] Restoring light state:', previousState);

  const success = await hue.client.setLightState(hue.lightId, previousState);

  if (success) {
    console.log('[BACKGROUND] Light restored');
    await clearPreviousLightState();
  } else {
    console.error('[BACKGROUND] Failed to restore light state');
  }

  return success;
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Meeting status update from content script
  if (message.type === MESSAGE_TYPES.STATUS) {
    // Save the previous light state if transitioning from NO_STATUS (or null on first load)
    const savePreviousLightState = message.previousStatus === STATUS_TYPES.NO_STATUS ||
                                   message.previousStatus === null;

    if (message.status === STATUS_TYPES.IN_MEETING) {
      handleSetInMeeting(savePreviousLightState);
    } else if (message.status === STATUS_TYPES.WARNING) {
      handleSetWarning(savePreviousLightState);
    } else {
      handleSetNotInMeeting();
    }
  }

  // Popup requesting current status
  if (message.type === MESSAGE_TYPES.GET_STATUS) {
    getStatus().then(status => {
      sendResponse({ status });
    });
    return true; // Keep channel open for async response
  }

  return false;
});

// Restore state on service worker startup (in case it was terminated during a meeting)
(async function initializeOnStartup() {
  const status = await getStatus();
  if (status === STATUS_TYPES.IN_MEETING) {
    console.log('[BACKGROUND] Service worker restarted while in meeting, state preserved');
  } else if (status === STATUS_TYPES.WARNING) {
    console.log('[BACKGROUND] Service worker restarted while in warning state, state preserved');
  }
})();
