// Message types
const MESSAGE_TYPES = {
  MEETING_STATUS: 'meetingStatus',
  GET_STATUS: 'getStatus'
};

const STORAGE_KEYS = {
  BRIDGE_IP: 'bridgeIp',
  USERNAME: 'username',
  LIGHT_ID: 'lightId',
  MEETING_HUE: 'meetingHue',
  MEETING_SAT: 'meetingSat',
  MEETING_BRI: 'meetingBri',
  PREVIOUS_LIGHT_STATE: 'previousLightState'
};

// Hue API conversion
const HUE_API = {
  MAX_HUE: 65535,
  MAX_SAT: 254,
  MAX_BRI: 254
};
