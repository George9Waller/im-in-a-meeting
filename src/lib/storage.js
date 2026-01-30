/**
 * Chrome storage wrapper module
 */

// Message types for communication between components
export const MESSAGE_TYPES = Object.freeze({
  MEETING_STATUS: 'meetingStatus',
  GET_STATUS: 'getStatus',
  STATUS_CHANGED: 'statusChanged'
});

// Storage keys
export const STORAGE_KEYS = Object.freeze({
  // Persistent config (chrome.storage.local)
  BRIDGE_IP: 'bridgeIp',
  USERNAME: 'username',
  LIGHT_ID: 'lightId',
  MEETING_HUE: 'meetingHue',
  MEETING_SAT: 'meetingSat',
  MEETING_BRI: 'meetingBri',

  // Session state (chrome.storage.session)
  PREVIOUS_LIGHT_STATE: 'previousLightState',
  CURRENT_MEETING_STATUS: 'currentMeetingStatus'
});

// Default meeting color (red)
const DEFAULT_MEETING_COLOR = Object.freeze({
  hue: 0,
  sat: 100,
  bri: 100
});

/**
 * Get Hue bridge configuration
 * @returns {Promise<{bridgeIp: string, username: string, lightId: string}>}
 */
export async function getBridgeConfig() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.BRIDGE_IP,
    STORAGE_KEYS.USERNAME,
    STORAGE_KEYS.LIGHT_ID
  ]);

  return {
    bridgeIp: result[STORAGE_KEYS.BRIDGE_IP] || '',
    username: result[STORAGE_KEYS.USERNAME] || '',
    lightId: result[STORAGE_KEYS.LIGHT_ID] || ''
  };
}

/**
 * Save Hue bridge configuration
 * @param {{bridgeIp?: string, username?: string, lightId?: string}} config
 */
export async function saveBridgeConfig(config) {
  const updates = {};
  if (config.bridgeIp !== undefined) updates[STORAGE_KEYS.BRIDGE_IP] = config.bridgeIp;
  if (config.username !== undefined) updates[STORAGE_KEYS.USERNAME] = config.username;
  if (config.lightId !== undefined) updates[STORAGE_KEYS.LIGHT_ID] = config.lightId;

  await chrome.storage.local.set(updates);
}

/**
 * Clear bridge configuration
 */
export async function clearBridgeConfig() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.BRIDGE_IP,
    STORAGE_KEYS.USERNAME,
    STORAGE_KEYS.LIGHT_ID
  ]);

  // Also clear session state
  await chrome.storage.session.remove([
    STORAGE_KEYS.PREVIOUS_LIGHT_STATE,
    STORAGE_KEYS.CURRENT_MEETING_STATUS
  ]);
}

/**
 * Get meeting color settings
 * @returns {Promise<{hue: number, sat: number, bri: number}>}
 */
export async function getMeetingColor() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.MEETING_HUE,
    STORAGE_KEYS.MEETING_SAT,
    STORAGE_KEYS.MEETING_BRI
  ]);

  return {
    hue: result[STORAGE_KEYS.MEETING_HUE] ?? DEFAULT_MEETING_COLOR.hue,
    sat: result[STORAGE_KEYS.MEETING_SAT] ?? DEFAULT_MEETING_COLOR.sat,
    bri: result[STORAGE_KEYS.MEETING_BRI] ?? DEFAULT_MEETING_COLOR.bri
  };
}

/**
 * Save meeting color settings
 * @param {{hue: number, sat: number, bri: number}} color
 */
export async function saveMeetingColor(color) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.MEETING_HUE]: color.hue,
    [STORAGE_KEYS.MEETING_SAT]: color.sat,
    [STORAGE_KEYS.MEETING_BRI]: color.bri
  });
}

/**
 * Get current meeting status (persisted across service worker restarts)
 * @returns {Promise<boolean>}
 */
export async function getMeetingStatus() {
  const result = await chrome.storage.session.get(STORAGE_KEYS.CURRENT_MEETING_STATUS);
  return result[STORAGE_KEYS.CURRENT_MEETING_STATUS] ?? false;
}

/**
 * Set current meeting status
 * @param {boolean} inMeeting
 */
export async function setMeetingStatus(inMeeting) {
  await chrome.storage.session.set({
    [STORAGE_KEYS.CURRENT_MEETING_STATUS]: inMeeting
  });
}

/**
 * Get previously saved light state
 * @returns {Promise<{on: boolean, bri: number, hue: number, sat: number} | null>}
 */
export async function getPreviousLightState() {
  const result = await chrome.storage.session.get(STORAGE_KEYS.PREVIOUS_LIGHT_STATE);
  return result[STORAGE_KEYS.PREVIOUS_LIGHT_STATE] || null;
}

/**
 * Save light state for later restoration
 * @param {{on: boolean, bri: number, hue: number, sat: number}} state
 */
export async function savePreviousLightState(state) {
  await chrome.storage.session.set({
    [STORAGE_KEYS.PREVIOUS_LIGHT_STATE]: state
  });
}

/**
 * Clear previous light state
 */
export async function clearPreviousLightState() {
  await chrome.storage.session.remove(STORAGE_KEYS.PREVIOUS_LIGHT_STATE);
}

/**
 * Get full configuration (bridge + color)
 * @returns {Promise<{bridgeIp: string, username: string, lightId: string, meetingHue: number, meetingSat: number, meetingBri: number}>}
 */
export async function getFullConfig() {
  const [bridgeConfig, meetingColor] = await Promise.all([
    getBridgeConfig(),
    getMeetingColor()
  ]);

  return {
    ...bridgeConfig,
    meetingHue: meetingColor.hue,
    meetingSat: meetingColor.sat,
    meetingBri: meetingColor.bri
  };
}
