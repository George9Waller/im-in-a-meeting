/**
 * Constants for content script (meet-detector.js)
 * Note: Content scripts cannot use ES modules, so this is a standalone file.
 * ES module users should import from lib/storage.js instead.
 */

// Message types for communication with background script
const MESSAGE_TYPES = Object.freeze({
  STATUS: 'status',
  GET_STATUS: 'getStatus',
  STATUS_CHANGED: 'statusChanged'
});

const STATUS_TYPES = Object.freeze({
  NO_STATUS: 'noStatus',
  IN_MEETING: 'inMeeting',
  WARNING: 'warning'
});
