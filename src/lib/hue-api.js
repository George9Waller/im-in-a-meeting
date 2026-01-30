/**
 * Philips Hue API communication module
 */

// Hue API value ranges
export const HUE_API = Object.freeze({
  MAX_HUE: 65535,
  MAX_SAT: 254,
  MAX_BRI: 254
});

// Retry configuration
const RETRY_CONFIG = Object.freeze({
  MAX_RETRIES: 3,
  BASE_DELAY_MS: 1000
});

/**
 * Validates an IP address format
 * @param {string} ip
 * @returns {boolean}
 */
export function isValidIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipPattern.test(ip)) return false;
  const parts = ip.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * Convert user-facing hue (0-360) to Hue API range (0-65535)
 * @param {number} hue
 * @returns {number}
 */
export function hueToApi(hue) {
  return Math.round((hue / 360) * HUE_API.MAX_HUE);
}

/**
 * Convert user-facing percentage (0-100) to Hue API range (0-254)
 * @param {number} percent
 * @returns {number}
 */
export function percentToApi(percent) {
  return Math.round((percent / 100) * HUE_API.MAX_SAT);
}

/**
 * Fetch with retry logic and exponential backoff
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} retries
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options = {}, retries = RETRY_CONFIG.MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        const delay = RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Hue API client class
 */
export class HueClient {
  constructor(bridgeIp, username) {
    this.bridgeIp = bridgeIp;
    this.username = username;
  }

  /**
   * Check if the client is properly configured
   * @returns {boolean}
   */
  isConfigured() {
    return isValidIp(this.bridgeIp) && !!this.username;
  }

  /**
   * Get the base API URL
   * @returns {string}
   */
  getBaseUrl() {
    return `http://${this.bridgeIp}/api/${this.username}`;
  }

  /**
   * Get current state of a light
   * @param {string} lightId
   * @returns {Promise<{on: boolean, bri: number, hue: number, sat: number} | null>}
   */
  async getLightState(lightId) {
    if (!this.isConfigured() || !lightId) {
      return null;
    }

    try {
      const response = await fetchWithRetry(`${this.getBaseUrl()}/lights/${lightId}`);
      const data = await response.json();

      if (data.error || !data.state) {
        console.error('[HueClient] Invalid light data:', data);
        return null;
      }

      return {
        on: data.state.on,
        bri: data.state.bri,
        hue: data.state.hue,
        sat: data.state.sat
      };
    } catch (error) {
      console.error('[HueClient] Error getting light state:', error);
      return null;
    }
  }

  /**
   * Set light state
   * @param {string} lightId
   * @param {{on?: boolean, bri?: number, hue?: number, sat?: number}} state
   * @returns {Promise<boolean>}
   */
  async setLightState(lightId, state) {
    if (!this.isConfigured() || !lightId) {
      return false;
    }

    try {
      const response = await fetchWithRetry(
        `${this.getBaseUrl()}/lights/${lightId}/state`,
        {
          method: 'PUT',
          body: JSON.stringify(state)
        }
      );
      const result = await response.json();

      if (Array.isArray(result) && result[0]?.error) {
        console.error('[HueClient] Error setting light state:', result[0].error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[HueClient] Error setting light state:', error);
      return false;
    }
  }

  /**
   * Get all lights
   * @returns {Promise<Object | null>}
   */
  async getLights() {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const response = await fetchWithRetry(`${this.getBaseUrl()}/lights`);
      const data = await response.json();

      if (data.error) {
        console.error('[HueClient] Error getting lights:', data.error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[HueClient] Error getting lights:', error);
      return null;
    }
  }
}

/**
 * Discover Hue bridges on the network
 * @returns {Promise<string | null>} Bridge IP or null if not found
 */
export async function discoverBridge() {
  try {
    const response = await fetchWithRetry('https://discovery.meethue.com/');
    const bridges = await response.json();

    if (Array.isArray(bridges) && bridges.length > 0 && bridges[0].internalipaddress) {
      return bridges[0].internalipaddress;
    }

    return null;
  } catch (error) {
    console.error('[HueClient] Bridge discovery failed:', error);
    return null;
  }
}

/**
 * Authenticate with a Hue bridge (requires physical button press)
 * @param {string} bridgeIp
 * @returns {Promise<{success: boolean, username?: string, error?: string}>}
 */
export async function authenticateBridge(bridgeIp) {
  if (!isValidIp(bridgeIp)) {
    return { success: false, error: chrome.i18n.getMessage('settingsBridgeIpInvalidMessage') };
  }

  try {
    const response = await fetch(`http://${bridgeIp}/api`, {
      method: 'POST',
      body: JSON.stringify({ devicetype: 'meeting_light#extension' })
    });
    const result = await response.json();

    if (result[0]?.error) {
      if (result[0].error.type === 101) {
        return { success: false, error: chrome.i18n.getMessage('settingsPressButtonError') };
      }
      return { success: false, error: result[0].error.description };
    }

    if (result[0]?.success?.username) {
      return { success: true, username: result[0].success.username };
    }

    return { success: false, error: chrome.i18n.getMessage('settingsUnexpectedResponseError') };
  } catch (error) {
    return { success: false, error: chrome.i18n.getMessage('settingsConnectionFailedError', [error.message]) };
  }
}
