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
  getFullConfig,
  saveWarningColorEnabled,
  saveWarningColor
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
  meetingBri: 100,
  warningColorEnabled: false,
  warningHue: 0,
  warningSat: 100,
  warningBri: 100
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
  testColorBtn: document.getElementById('testColorBtn'),
  saveColorBtn: document.getElementById('saveColorBtn'),

  // Warning Color section
  warningColorSection: document.getElementById('warningColorSection'),
  enableWarningColor: document.getElementById('enableWarningColor'),
  warningColorPickerField: document.getElementById('warningColorPickerField'),
  testWarningColorBtn: document.getElementById('testWarningColorBtn'),
  saveWarningColorBtn: document.getElementById('saveWarningColorBtn'),

  // Color elements
  meetingColorPicker: {
    configPrefix: 'meeting',
    preview: document.getElementById('colorPreview'),
    hueSlider: document.getElementById('hueSlider'),
    satSlider: document.getElementById('satSlider'),
    briSlider: document.getElementById('briSlider'),
    hueValue: document.getElementById('hueValue'),
    satValue: document.getElementById('satValue'),
    briValue: document.getElementById('briValue'),
    statusId: 'colorStatus',
  },
  warningColorPicker: {
    configPrefix: 'warning',
    preview: document.getElementById('warningColorPreview'),
    hueSlider: document.getElementById('warningHueSlider'),
    satSlider: document.getElementById('warningSatSlider'),
    briSlider: document.getElementById('warningBriSlider'),
    hueValue: document.getElementById('warningHueValue'),
    satValue: document.getElementById('warningSatValue'),
    briValue: document.getElementById('warningBriValue'),
    statusId: 'warningColorStatus',
  }
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
 * @param {{configPrefix: string, hueSlider: HTMLInputElement, satSlider: HTMLInputElement, briSlider: HTMLInputElement, hueValue: HTMLElement, satValue: HTMLElement, briValue: HTMLElement, colorPreview: HTMLElement, statusId: string}} colorElements
 */
function updateColorPreview(colorElements) {
  const hue = parseInt(colorElements.hueSlider.value);
  const sat = parseInt(colorElements.satSlider.value);
  const bri = parseInt(colorElements.briSlider.value);

  colorElements.hueValue.textContent = `${hue}°`;
  colorElements.satValue.textContent = `${sat}%`;
  colorElements.briValue.textContent = `${bri}%`;

  // Convert to CSS HSL (approximate)
  colorElements.preview.style.backgroundColor = `hsl(${hue}, ${sat}%, ${bri / 2}%)`;

  config[`${colorElements.configPrefix}Hue`] = hue;
  config[`${colorElements.configPrefix}Sat`] = sat;
  config[`${colorElements.configPrefix}Bri`] = bri;
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
    meetingBri: config.meetingBri,
    warningColorEnabled: config.warningColorEnabled,
    warningHue: config.warningHue,
    warningSat: config.warningSat,
    warningBri: config.warningBri
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
  elements.warningColorSection.classList.add('hidden');

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

  // Show color sections
  elements.colorSection.classList.remove('hidden');
  elements.warningColorSection.classList.remove('hidden');
}

// ============================================================================
// Color Settings
// ============================================================================

/**
 * Test the current color on the selected light
 * @param {{configPrefix: string, hueSlider: HTMLInputElement, satSlider: HTMLInputElement, briSlider: HTMLInputElement, hueValue: HTMLElement, satValue: HTMLElement, briValue: HTMLElement, colorPreview: HTMLElement, statusId: string}} colorElements
 */
async function handleTestColor(colorElements) {
  if (!hueClient || !config.lightId) {
    showStatus(colorElements.statusId, chrome.i18n.getMessage('settingsNotConfiguredError'), 'error');
    return;
  }

  // Save current light state
  const savedState = await hueClient.getLightState(config.lightId);

  if (!savedState) {
    showStatus(colorElements.statusId, chrome.i18n.getMessage('settingsFailedToGetLightState'), 'error');
    return;
  }

  // Apply test color
  const success = await hueClient.setLightState(config.lightId, {
    on: true,
    hue: hueToApi(config[`${colorElements.configPrefix}Hue`]),
    sat: percentToApi(config[`${colorElements.configPrefix}Sat`]),
    bri: percentToApi(config[`${colorElements.configPrefix}Bri`])
  });

  if (!success) {
    showStatus(colorElements.statusId, chrome.i18n.getMessage('settingsFailedToSetTestColor'), 'error');
    return;
  }

  showStatus(colorElements.statusId, chrome.i18n.getMessage('settingsTestingWillRestore'), 'info');

  // Restore original state after 2 seconds
  setTimeout(async () => {
    await hueClient.setLightState(config.lightId, savedState);
    showStatus(colorElements.statusId, chrome.i18n.getMessage('settingsLightRestored'), 'success');
  }, 2000);
}

/**
 * Save color settings
 * @param {{configPrefix: string, hueSlider: HTMLInputElement, satSlider: HTMLInputElement, briSlider: HTMLInputElement, hueValue: HTMLElement, satValue: HTMLElement, briValue: HTMLElement, colorPreview: HTMLElement, statusId: string}} colorElements
 */
async function handleSaveColor(colorElements) {
  const saveMethod = colorElements.configPrefix === 'meeting' ? saveMeetingColor : saveWarningColor;
  await saveMethod({
    hue: config[`${colorElements.configPrefix}Hue`],
    sat: config[`${colorElements.configPrefix}Sat`],
    bri: config[`${colorElements.configPrefix}Bri`]
  });

  showStatus(colorElements.statusId, chrome.i18n.getMessage('settingsSavedMessage'), 'success');
}

// ============================================================================
// Warning Color Settings
// ============================================================================

/**
 * Set warning color picker visibility
 * @param {boolean} visible
 */
function updateWarningColorPickerVisibility(visible) {
  if (visible) {
    elements.warningColorPickerField.classList.remove('hidden');
  } else {
    elements.warningColorPickerField.classList.add('hidden');
  }
}


/**
 * Handle toggling the warning color setting
 */
async function handleWarningColorToggle() {
  const enabled = elements.enableWarningColor.checked;
  elements.enableWarningColor.disabled = true;

  await saveWarningColorEnabled(enabled);
  elements.enableWarningColor.disabled = false;

  updateWarningColorPickerVisibility(enabled);
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
    meetingBri: fullConfig.meetingBri,
    warningColorEnabled: fullConfig.warningColorEnabled,
    warningHue: fullConfig.warningHue,
    warningSat: fullConfig.warningSat,
    warningBri: fullConfig.warningBri
  };

  // Update color sliders
  elements.meetingColorPicker.hueSlider.value = config.meetingHue;
  elements.meetingColorPicker.satSlider.value = config.meetingSat;
  elements.meetingColorPicker.briSlider.value = config.meetingBri;
  elements.warningColorPicker.hueSlider.value = config.warningHue;
  elements.warningColorPicker.satSlider.value = config.warningSat;
  elements.warningColorPicker.briSlider.value = config.warningBri;
  updateColorPreview(elements.meetingColorPicker);
  updateColorPreview(elements.warningColorPicker);

  updateClearButtonVisibility();

  // Update warning color picker visibility
  elements.enableWarningColor.checked = config.warningColorEnabled;
  updateWarningColorPickerVisibility(config.warningColorEnabled);

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
  elements.testColorBtn.addEventListener('click', () => handleTestColor(elements.meetingColorPicker));
  elements.saveColorBtn.addEventListener('click', () => handleSaveColor(elements.meetingColorPicker));

  elements.meetingColorPicker.hueSlider.addEventListener('input', () => updateColorPreview(elements.meetingColorPicker));
  elements.meetingColorPicker.satSlider.addEventListener('input', () => updateColorPreview(elements.meetingColorPicker));
  elements.meetingColorPicker.briSlider.addEventListener('input', () => updateColorPreview(elements.meetingColorPicker));

  // Warning color controls
  elements.enableWarningColor.addEventListener('change', handleWarningColorToggle);

  elements.testWarningColorBtn.addEventListener('click', () => handleTestColor(elements.warningColorPicker));
  elements.saveWarningColorBtn.addEventListener('click', () => handleSaveColor(elements.warningColorPicker));

  elements.warningColorPicker.hueSlider.addEventListener('input', () => updateColorPreview(elements.warningColorPicker));
  elements.warningColorPicker.satSlider.addEventListener('input', () => updateColorPreview(elements.warningColorPicker));
  elements.warningColorPicker.briSlider.addEventListener('input', () => updateColorPreview(elements.warningColorPicker));

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
        elements.warningColorSection.classList.remove('hidden');
      }
    }
  } else {
    handleDiscoverBridge();
  }
}

// Start
initialize();
