/**
 * Constants for content script (meet-detector.js)
 * Note: Content scripts cannot use ES modules, so this is a standalone file.
 * ES module users should import from lib/storage.js instead.
 */

// Message types for communication with background script
const MESSAGE_TYPES = Object.freeze({
  MEETING_STATUS: 'meetingStatus',
  GET_STATUS: 'getStatus',
  STATUS_CHANGED: 'statusChanged'
});
