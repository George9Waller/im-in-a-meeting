/**
 * Background service worker for "I'm in a meeting" extension
 * Manages meeting state and Hue light control
 */

import { HueClient, hueToApi, percentToApi } from './lib/hue-api.js';
import {
  MESSAGE_TYPES,
  getBridgeConfig,
  getMeetingColor,
  getMeetingStatus,
  setMeetingStatus,
  getPreviousLightState,
  savePreviousLightState,
  clearPreviousLightState
} from './lib/storage.js';

/**
 * Broadcast meeting status change to all extension pages (popup, etc.)
 * @param {boolean} inMeeting
 */
function broadcastStatusChange(inMeeting) {
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.STATUS_CHANGED,
    inMeeting
  }).catch(() => {
    // Popup may not be open, ignore errors
  });
}

/**
 * Handle transition to "in meeting" state
 */
async function handleSetInMeeting() {
  const currentStatus = await getMeetingStatus();
  if (currentStatus === true) return; // Already in meeting

  console.log('[BACKGROUND] Joining meeting, saving light state and setting meeting color');

  await setMeetingStatus(true);
  broadcastStatusChange(true);

  const saved = await saveLightState();
  if (saved) {
    await setLightToMeetingColor();
  }
}

/**
 * Handle transition to "not in meeting" state
 */
async function handleSetNotInMeeting() {
  const currentStatus = await getMeetingStatus();
  if (currentStatus === false) return; // Already not in meeting

  console.log('[BACKGROUND] Leaving meeting, restoring light state');

  await setMeetingStatus(false);
  broadcastStatusChange(false);

  await restoreLightState();
}

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
  if (message.type === MESSAGE_TYPES.MEETING_STATUS) {
    if (message.inMeeting) {
      handleSetInMeeting();
    } else {
      handleSetNotInMeeting();
    }
  }

  // Popup requesting current status
  if (message.type === MESSAGE_TYPES.GET_STATUS) {
    getMeetingStatus().then(inMeeting => {
      sendResponse({ inMeeting });
    });
    return true; // Keep channel open for async response
  }

  return false;
});

// Restore state on service worker startup (in case it was terminated during a meeting)
(async function initializeOnStartup() {
  const inMeeting = await getMeetingStatus();
  if (inMeeting) {
    console.log('[BACKGROUND] Service worker restarted while in meeting, state preserved');
  }
})();
