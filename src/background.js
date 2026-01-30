importScripts('constants.js');

let currentMeetingStatus = false;

// Listen for messages from both content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Meeting status update from content script
  if (message.type === MESSAGE_TYPES.MEETING_STATUS) {
    message.inMeeting ? handleSetInMeeting() : handleSetNotInMeeting();
  }

  // Popup requesting current status
  if (message.type === MESSAGE_TYPES.GET_STATUS) {
    sendResponse({ inMeeting: currentMeetingStatus });
  }

  // Return true to indicate we'll send response asynchronously if needed
  return true;
});

async function handleSetInMeeting() {
  if (currentMeetingStatus === true) return; // Already in meeting

  console.log('[BACKGROUND] Joining meeting, saving light state and setting meeting color');
  currentMeetingStatus = true;
  await saveLightState();
  await setLightToMeetingColor();
}

async function handleSetNotInMeeting() {
  if (currentMeetingStatus === false) return; // Already not in meeting

  console.log('[BACKGROUND] Leaving meeting, restoring light state');
  currentMeetingStatus = false;
  await restoreLightState();
}

async function saveLightState() {
  const config = await getConfig();

  if (!config.bridgeIp || !config.username || !config.lightId) {
    console.error('[BACKGROUND] Hue not configured');
    return;
  }

  try {
    const response = await fetch(
      `http://${config.bridgeIp}/api/${config.username}/lights/${config.lightId}`
    );
    const lightData = await response.json();
    console.log('[BACKGROUND] Current light state:', lightData);

    previousLightState = {
      on: lightData.state.on,
      bri: lightData.state.bri,
      hue: lightData.state.hue,
      sat: lightData.state.sat
    };

    await chrome.storage.local.set({ previousLightState });
    console.log('[BACKGROUND] Saved light state:', previousLightState);
  } catch (error) {
    console.error('[BACKGROUND] Error saving light state:', error);
  }
}

async function setLightToMeetingColor() {
  const config = await getConfig();
  const meetingColor = await chrome.storage.local.get([STORAGE_KEYS.MEETING_HUE, STORAGE_KEYS.MEETING_SAT, STORAGE_KEYS.MEETING_BRI]);

  // Convert from 0-360/0-100 to Hue API ranges (0-65535 for hue, 0-254 for sat/bri)
  const hue = Math.round((meetingColor.meetingHue ?? 0) / 360 * HUE_API.MAX_HUE);
  const sat = Math.round((meetingColor.meetingSat ?? 100) / 100 * HUE_API.MAX_SAT);
  const bri = Math.round((meetingColor.meetingBri ?? 100) / 100 * HUE_API.MAX_BRI);

  console.log('[BACKGROUND] setLightToMeetingColor - config:', config, 'color:', {
    raw: meetingColor,
    converted: { hue, sat, bri }
  });

  try {
    const response = await fetch(
      `http://${config.bridgeIp}/api/${config.username}/lights/${config.lightId}/state`,
      {
        method: 'PUT',
        body: JSON.stringify({
          on: true,
          hue: hue,
          sat: sat,
          bri: bri
        })
      }
    );
    const result = await response.json();
    console.log('[BACKGROUND] Light set to meeting color:', result);
  } catch (error) {
    console.error('[BACKGROUND] Error setting light:', error);
  }
}

async function restoreLightState() {
  const config = await getConfig();
  const { previousLightState } = await chrome.storage.local.get('previousLightState');

  console.log('[BACKGROUND] restoreLightState:', { config, previousLightState });

  if (!previousLightState) {
    console.log('[BACKGROUND] No previous state to restore');
    return;
  }

  try {
    const response = await fetch(
      `http://${config.bridgeIp}/api/${config.username}/lights/${config.lightId}/state`,
      {
        method: 'PUT',
        body: JSON.stringify(previousLightState)
      }
    );
    const result = await response.json();
    console.log('[BACKGROUND] Light restored:', result);
  } catch (error) {
    console.error('[BACKGROUND] Error restoring light state:', error);
  }
}

async function getConfig() {
  const result = await chrome.storage.local.get([STORAGE_KEYS.BRIDGE_IP, STORAGE_KEYS.USERNAME, STORAGE_KEYS.LIGHT_ID]);
  return result;
}
