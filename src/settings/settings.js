/**
 * Settings page for "I'm in a meeting" extension
 * Handles Hue bridge configuration, light selection, and color settings
 */

import {
  HueClient,
  HUE_API,
  isValidIp,
  hueToApi,
  percentToApi,
  discoverBridge,
  authenticateBridge
} from '../lib/hue-api.js';

import {
  STORAGE_KEYS,
  getBridgeConfig,
  saveBridgeConfig,
  clearBridgeConfig,
  getMeetingColor,
  saveMeetingColor,
  getFullConfig
} from '../lib/storage.js';

// ============================================================================
// State
// ============================================================================

let config = {
  bridgeIp: '',
  username: '',
  lightId: '',
  meetingHue: 0,
  meetingSat: 100,
  meetingBri: 100
};

let hueClient = null;

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
  // Bridge section
  bridgeIp: document.getElementById('bridgeIp'),
  usernameField: document.getElementById('usernameField'),
  clearBridgeBtn: document.getElementById('clearBridgeBtn'),
  rediscoverBtn: document.getElementById('rediscoverBtn'),
  authenticateBtn: document.getElementById('authenticateBtn'),
  bridgeStatus: document.getElementById('bridgeStatus'),

  // Light section
  lightSection: document.getElementById('lightSection'),
  lightGrid: document.getElementById('lightGrid'),
  lightStatus: document.getElementById('lightStatus'),

  // Color section
  colorSection: document.getElementById('colorSection'),
  colorPreview: document.getElementById('colorPreview'),
  hueSlider: document.getElementById('hueSlider'),
  satSlider: document.getElementById('satSlider'),
  briSlider: document.getElementById('briSlider'),
  hueValue: document.getElementById('hueValue'),
  satValue: document.getElementById('satValue'),
  briValue: document.getElementById('briValue'),
  testColorBtn: document.getElementById('testColorBtn'),
  saveColorBtn: document.getElementById('saveColorBtn'),
  colorStatus: document.getElementById('colorStatus')
};

// ============================================================================
// UI Helpers
// ============================================================================

/**
 * Show a status message
 * @param {string} elementId - ID of the status element
 * @param {string} message - Message to display
 * @param {'success' | 'error' | 'info'} type - Message type
 */
function showStatus(elementId, message, type) {
  const statusEl = document.getElementById(elementId);
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  statusEl.style.display = 'block';

  if (type !== 'info') {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
}

/**
 * Update the clear bridge button visibility
 */
function updateClearButtonVisibility() {
  elements.clearBridgeBtn.style.display =
    config.bridgeIp && config.username ? 'block' : 'none';
}

/**
 * Update the color preview based on current slider values
 */
function updateColorPreview() {
  const hue = parseInt(elements.hueSlider.value);
  const sat = parseInt(elements.satSlider.value);
  const bri = parseInt(elements.briSlider.value);

  elements.hueValue.textContent = `${hue}°`;
  elements.satValue.textContent = `${sat}%`;
  elements.briValue.textContent = `${bri}%`;

  // Convert to CSS HSL (approximate)
  elements.colorPreview.style.backgroundColor = `hsl(${hue}, ${sat}%, ${bri / 2}%)`;

  config.meetingHue = hue;
  config.meetingSat = sat;
  config.meetingBri = bri;
}

// ============================================================================
// Bridge Discovery & Authentication
// ============================================================================

/**
 * Discover Hue bridge on the network
 */
async function handleDiscoverBridge() {
  showStatus('bridgeStatus', chrome.i18n.getMessage('settingsDiscovering'), 'info');

  const bridgeIp = await discoverBridge();

  if (bridgeIp) {
    if (!isValidIp(bridgeIp)) {
      showStatus('bridgeStatus', chrome.i18n.getMessage('settingsBridgeIpInvalid'), 'error');
      enableManualIpEntry();
      return;
    }

    config.bridgeIp = bridgeIp;
    elements.bridgeIp.value = bridgeIp;
    elements.authenticateBtn.disabled = false;
    elements.usernameField.classList.remove('hidden');
    showStatus('bridgeStatus', chrome.i18n.getMessage('settingsAuthenticationSuccess', [bridgeIp]), 'success');

    // If we already have a username, try to authenticate
    if (config.username) {
      await testAuthentication();
    }
  } else {
    showStatus('bridgeStatus', chrome.i18n.getMessage('settingsNoBridgeFound'), 'error');
    enableManualIpEntry();
  }
}

/**
 * Enable manual IP entry when discovery fails
 */
function enableManualIpEntry() {
  elements.bridgeIp.readOnly = false;
  elements.bridgeIp.placeholder = '192.168.1.100';
  elements.authenticateBtn.disabled = false;
  elements.usernameField.classList.remove('hidden');
}

/**
 * Test if existing authentication works
 * @returns {Promise<boolean>}
 */
async function testAuthentication() {
  if (!config.bridgeIp || !config.username) return false;

  if (!isValidIp(config.bridgeIp)) {
    showStatus('bridgeStatus', chrome.i18n.getMessage('settingsBridgeIpInvalidMessage'), 'error');
    return false;
  }

  hueClient = new HueClient(config.bridgeIp, config.username);
  const lights = await hueClient.getLights();

  if (lights) {
    showStatus('bridgeStatus', chrome.i18n.getMessage('settingsAlreadyAuthenticated'), 'success');
    await loadLights();
    return true;
  }

  return false;
}

/**
 * Authenticate with the Hue bridge
 */
async function handleAuthenticate() {
  if (!config.bridgeIp) {
    showStatus('bridgeStatus', chrome.i18n.getMessage('settingsBridgeIpMissing'), 'error');
    return;
  }

  if (!isValidIp(config.bridgeIp)) {
    showStatus('bridgeStatus', chrome.i18n.getMessage('settingsBridgeIpInvalidFormat'), 'error');
    return;
  }

  showStatus('bridgeStatus', chrome.i18n.getMessage('settingsPressButton'), 'info');

  const result = await authenticateBridge(config.bridgeIp);

  if (result.success) {
    config.username = result.username;
    await saveBridgeConfig({
      bridgeIp: config.bridgeIp,
      username: config.username
    });

    hueClient = new HueClient(config.bridgeIp, config.username);
    showStatus('bridgeStatus', chrome.i18n.getMessage('settingsAuthenticationSuccessShort'), 'success');
    updateClearButtonVisibility();
    await loadLights();
  } else {
    showStatus('bridgeStatus', result.error, 'error');
  }
}

/**
 * Clear bridge configuration
 */
async function handleClearBridge() {
  await clearBridgeConfig();

  // Reset config object (preserve color settings)
  config = {
    bridgeIp: '',
    username: '',
    lightId: '',
    meetingHue: config.meetingHue,
    meetingSat: config.meetingSat,
    meetingBri: config.meetingBri
  };
  hueClient = null;

  // Reset UI
  elements.bridgeIp.value = '';
  elements.bridgeIp.placeholder = chrome.i18n.getMessage('settingsBridgeIpPlaceholder');
  elements.bridgeIp.readOnly = true;
  elements.authenticateBtn.disabled = true;
  elements.usernameField.classList.add('hidden');
  elements.lightSection.classList.add('hidden');
  elements.colorSection.classList.add('hidden');

  showStatus('bridgeStatus', chrome.i18n.getMessage('settingsBridgeCleared'), 'success');
  updateClearButtonVisibility();
}

// ============================================================================
// Light Selection
// ============================================================================

/**
 * Load available lights from the bridge
 */
async function loadLights() {
  const loadingLightsMessage = chrome.i18n.getMessage('settingsLoadingLights');
  elements.lightSection.classList.remove('hidden');
  elements.lightGrid.innerHTML = `<div class="loading">${loadingLightsMessage}</div>`;

  if (!hueClient) {
    showStatus('lightStatus', chrome.i18n.getMessage('settingsNotConnectedToBridge'), 'error');
    return;
  }

  const lights = await hueClient.getLights();

  if (!lights) {
    showStatus('lightStatus', chrome.i18n.getMessage('settingsFailedToLoadLights'), 'error');
    return;
  }

  // Clear loading
  elements.lightGrid.innerHTML = '';

  // Create light cards
  Object.entries(lights).forEach(([id, light]) => {
    const card = document.createElement('div');
    card.className = 'light-card';
    if (config.lightId === id) {
      card.classList.add('selected');
    }

    card.innerHTML = `
      <div class="light-name">${escapeHtml(light.name)}</div>
      <div class="light-type">${escapeHtml(light.type)}</div>
      <div class="light-id">ID: ${escapeHtml(id)}</div>
    `;

    card.addEventListener('click', () => selectLight(id, light.name, card));
    elements.lightGrid.appendChild(card);
  });
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Select a light
 * @param {string} lightId
 * @param {string} lightName
 * @param {HTMLElement} cardElement
 */
async function selectLight(lightId, lightName, cardElement) {
  // Remove previous selection
  document.querySelectorAll('.light-card').forEach(card => {
    card.classList.remove('selected');
  });

  // Select this card
  cardElement.classList.add('selected');
  config.lightId = lightId;

  await saveBridgeConfig({ lightId });
  showStatus('lightStatus', chrome.i18n.getMessage('settingsLightSelected', [lightName]), 'success');

  // Show color section
  elements.colorSection.classList.remove('hidden');
}

// ============================================================================
// Color Settings
// ============================================================================

/**
 * Test the current color on the selected light
 */
async function handleTestColor() {
  if (!hueClient || !config.lightId) {
    showStatus('colorStatus', chrome.i18n.getMessage('settingsNotConfiguredError'), 'error');
    return;
  }

  // Save current light state
  const savedState = await hueClient.getLightState(config.lightId);

  if (!savedState) {
    showStatus('colorStatus', chrome.i18n.getMessage('settingsFailedToGetLightState'), 'error');
    return;
  }

  // Apply test color
  const success = await hueClient.setLightState(config.lightId, {
    on: true,
    hue: hueToApi(config.meetingHue),
    sat: percentToApi(config.meetingSat),
    bri: percentToApi(config.meetingBri)
  });

  if (!success) {
    showStatus('colorStatus', chrome.i18n.getMessage('settingsFailedToSetTestColor'), 'error');
    return;
  }

  showStatus('colorStatus', chrome.i18n.getMessage('settingsTestingWillRestore'), 'info');

  // Restore original state after 2 seconds
  setTimeout(async () => {
    await hueClient.setLightState(config.lightId, savedState);
    showStatus('colorStatus', chrome.i18n.getMessage('settingsLightRestored'), 'success');
  }, 2000);
}

/**
 * Save color settings
 */
async function handleSaveColor() {
  await saveMeetingColor({
    hue: config.meetingHue,
    sat: config.meetingSat,
    bri: config.meetingBri
  });

  showStatus('colorStatus', chrome.i18n.getMessage('settingsSavedMessage'), 'success');
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Load existing configuration
 */
async function loadConfig() {
  const fullConfig = await getFullConfig();

  config = {
    bridgeIp: fullConfig.bridgeIp || '',
    username: fullConfig.username || '',
    lightId: fullConfig.lightId || '',
    meetingHue: fullConfig.meetingHue,
    meetingSat: fullConfig.meetingSat,
    meetingBri: fullConfig.meetingBri
  };

  // Update color sliders
  elements.hueSlider.value = config.meetingHue;
  elements.satSlider.value = config.meetingSat;
  elements.briSlider.value = config.meetingBri;
  updateColorPreview();

  updateClearButtonVisibility();

  return config;
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Bridge buttons
  elements.clearBridgeBtn.addEventListener('click', handleClearBridge);
  elements.rediscoverBtn.addEventListener('click', handleDiscoverBridge);
  elements.authenticateBtn.addEventListener('click', handleAuthenticate);

  // Color controls
  elements.testColorBtn.addEventListener('click', handleTestColor);
  elements.saveColorBtn.addEventListener('click', handleSaveColor);

  elements.hueSlider.addEventListener('input', updateColorPreview);
  elements.satSlider.addEventListener('input', updateColorPreview);
  elements.briSlider.addEventListener('input', updateColorPreview);

  // Allow manual IP entry
  elements.bridgeIp.addEventListener('change', (e) => {
    const ip = e.target.value.trim();
    if (ip && !isValidIp(ip)) {
      showStatus('bridgeStatus', chrome.i18n.getMessage('settingsBridgeIpInvalidFormat'), 'error');
      return;
    }
    config.bridgeIp = ip;
    elements.authenticateBtn.disabled = !ip;
    elements.usernameField.classList.remove('hidden');
  });
}

/**
 * Initialize the settings page
 */
async function initialize() {
  setupEventListeners();
  await loadConfig();

  if (config.bridgeIp) {
    elements.bridgeIp.value = config.bridgeIp;
    elements.authenticateBtn.disabled = false;
    elements.usernameField.classList.remove('hidden');

    if (config.username) {
      const authenticated = await testAuthentication();
      if (authenticated && config.lightId) {
        elements.colorSection.classList.remove('hidden');
      }
    }
  } else {
    handleDiscoverBridge();
  }
}

// Start
initialize();
