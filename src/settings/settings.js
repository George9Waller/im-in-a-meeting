let config = {
  bridgeIp: '',
  username: '',
  lightId: '',
  meetingHue: 0,
  meetingSat: 100,
  meetingBri: 100
};

// Load existing config
async function loadConfig() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.BRIDGE_IP,
    STORAGE_KEYS.USERNAME,
    STORAGE_KEYS.LIGHT_ID,
    STORAGE_KEYS.MEETING_HUE,
    STORAGE_KEYS.MEETING_SAT,
    STORAGE_KEYS.MEETING_BRI
  ]);

  config = {
    bridgeIp: stored.bridgeIp || '',
    username: stored.username || '',
    lightId: stored.lightId || '',
    meetingHue: stored.meetingHue ?? 0,
    meetingSat: stored.meetingSat ?? 100,
    meetingBri: stored.meetingBri ?? 100
  };

  // Update UI
  if (config.meetingHue !== undefined) {
    document.getElementById('hueSlider').value = config.meetingHue;
    document.getElementById('satSlider').value = config.meetingSat;
    document.getElementById('briSlider').value = config.meetingBri;
    updateColorPreview();
  }

  updateClearButtonVisibility();

  return config;
}

// Discover bridge using Philips Hue discovery service
async function discoverBridge() {
  showStatus('bridgeStatus', 'Discovering bridge...', 'info');

  try {
    // Try official Hue discovery endpoint
    const response = await fetch('https://discovery.meethue.com/');
    const bridges = await response.json();

    if (bridges.length > 0) {
      const bridgeIp = bridges[0].internalipaddress;
      config.bridgeIp = bridgeIp;
      document.getElementById('bridgeIp').value = bridgeIp;
      document.getElementById('authenticateBtn').disabled = false;
      document.getElementById('usernameField').classList.remove('hidden');
      showStatus('bridgeStatus', `Found bridge at ${bridgeIp}`, 'success');

      // If we already have a username, try to authenticate
      if (config.username) {
        await testAuthentication();
      }
    } else {
      showStatus('bridgeStatus', 'No bridge found. Make sure your bridge is on the same network.', 'error');
    }
  } catch (error) {
    console.error('Discovery error:', error);
    showStatus('bridgeStatus', 'Discovery failed. Please enter IP manually.', 'error');
    document.getElementById('bridgeIp').readOnly = false;
    document.getElementById('bridgeIp').placeholder = '192.168.1.100';
    document.getElementById('authenticateBtn').disabled = false;
    document.getElementById('usernameField').classList.remove('hidden');
  }
}

// Test if existing authentication works
async function testAuthentication() {
  if (!config.bridgeIp || !config.username) return false;

  try {
    const response = await fetch(
      `http://${config.bridgeIp}/api/${config.username}/lights`
    );
    const result = await response.json();

    if (result.error) {
      return false;
    }

    // Authentication works!
    showStatus('bridgeStatus', 'Already authenticated!', 'success');
    await loadLights();
    return true;
  } catch (error) {
    return false;
  }
}

// Authenticate with bridge
async function authenticate() {
  if (!config.bridgeIp) {
    showStatus('bridgeStatus', 'Please discover or enter bridge IP first', 'error');
    return;
  }

  showStatus('bridgeStatus', 'Press the button on your bridge now...', 'info');

  try {
    const response = await fetch(
      `http://${config.bridgeIp}/api`,
      {
        method: 'POST',
        body: JSON.stringify({ devicetype: 'meeting_light#extension' })
      }
    );

    const result = await response.json();

    if (result[0]?.error) {
      if (result[0].error.type === 101) {
        showStatus('bridgeStatus', 'Press the button on your bridge and try again', 'error');
      } else {
        showStatus('bridgeStatus', `Error: ${result[0].error.description}`, 'error');
      }
      return;
    }

    if (result[0]?.success) {
      config.username = result[0].success.username;
      await chrome.storage.local.set({
        bridgeIp: config.bridgeIp,
        username: config.username
      });
      showStatus('bridgeStatus', 'Authenticated successfully!', 'success');
      updateClearButtonVisibility();
      await loadLights();
    }
  } catch (error) {
    showStatus('bridgeStatus', `Connection failed: ${error.message}`, 'error');
  }
}

// Load available lights
async function loadLights() {
  document.getElementById('lightSection').classList.remove('hidden');
  const lightGrid = document.getElementById('lightGrid');
  lightGrid.innerHTML = '<div class="loading">Loading lights...</div>';

  try {
    const response = await fetch(
      `http://${config.bridgeIp}/api/${config.username}/lights`
    );
    const lights = await response.json();

    if (lights.error) {
      showStatus('lightStatus', `Error: ${lights.error.description}`, 'error');
      return;
    }

    // Clear loading
    lightGrid.innerHTML = '';

    // Create light cards
    Object.entries(lights).forEach(([id, light]) => {
      const card = document.createElement('div');
      card.className = 'light-card';
      if (config.lightId === id) {
        card.classList.add('selected');
      }

      card.innerHTML = `
        <div class="light-name">${light.name}</div>
        <div class="light-type">${light.type}</div>
        <div class="light-id">ID: ${id}</div>
      `;

      card.addEventListener('click', () => selectLight(id, card));
      lightGrid.appendChild(card);
    });

  } catch (error) {
    showStatus('lightStatus', `Failed to load lights: ${error.message}`, 'error');
  }
}

// Select a light
async function selectLight(lightId, cardElement) {
  // Remove previous selection
  document.querySelectorAll('.light-card').forEach(card => {
    card.classList.remove('selected');
  });

  // Select this card
  cardElement.classList.add('selected');
  config.lightId = lightId;

  await chrome.storage.local.set({ lightId });
  showStatus('lightStatus', 'Light selected!', 'success');

  // Show color section
  document.getElementById('colorSection').classList.remove('hidden');
}

// Update color preview
function updateColorPreview() {
  const hue = parseInt(document.getElementById('hueSlider').value);
  const sat = parseInt(document.getElementById('satSlider').value);
  const bri = parseInt(document.getElementById('briSlider').value);

  document.getElementById('hueValue').textContent = `${hue}°`;
  document.getElementById('satValue').textContent = `${sat}%`;
  document.getElementById('briValue').textContent = `${bri}%`;

  // Convert to CSS HSL
  const preview = document.getElementById('colorPreview');
  preview.style.backgroundColor = `hsl(${hue}, ${sat}%, ${bri / 2}%)`;

  config.meetingHue = hue;
  config.meetingSat = sat;
  config.meetingBri = bri;
}

// Convert 0-360 hue to 0-65535 Hue API range
function hueToApi(hue) {
  return Math.round((hue / 360) * HUE_API.MAX_HUE);
}

// Convert 0-100 percentage to 0-254 API range
function percentToApi(percent) {
  return Math.round((percent / 100) * HUE_API.MAX_SAT);
}

// Test color
async function testColor() {
  if (!config.bridgeIp || !config.username || !config.lightId) {
    showStatus('colorStatus', 'Please complete bridge and light setup first', 'error');
    return;
  }

  try {
    // Save current light state first
    const currentStateResponse = await fetch(
      `http://${config.bridgeIp}/api/${config.username}/lights/${config.lightId}`
    );
    const currentLightData = await currentStateResponse.json();
    const savedState = {
      on: currentLightData.state.on,
      hue: currentLightData.state.hue,
      sat: currentLightData.state.sat,
      bri: currentLightData.state.bri
    };

    // Apply test color
    const response = await fetch(
      `http://${config.bridgeIp}/api/${config.username}/lights/${config.lightId}/state`,
      {
        method: 'PUT',
        body: JSON.stringify({
          on: true,
          hue: hueToApi(config.meetingHue),
          sat: percentToApi(config.meetingSat),
          bri: percentToApi(config.meetingBri)
        })
      }
    );

    const result = await response.json();

    if (result[0]?.error) {
      showStatus('colorStatus', `Error: ${result[0].error.description}`, 'error');
    } else {
      showStatus('colorStatus', 'Testing... will restore in 2s', 'info');

      // Restore original state after 2 seconds
      setTimeout(async () => {
        await fetch(
          `http://${config.bridgeIp}/api/${config.username}/lights/${config.lightId}/state`,
          {
            method: 'PUT',
            body: JSON.stringify(savedState)
          }
        );
        showStatus('colorStatus', 'Light restored', 'success');
      }, 2000);
    }
  } catch (error) {
    showStatus('colorStatus', `Test failed: ${error.message}`, 'error');
  }
}

// Save color settings
async function saveColor() {
  await chrome.storage.local.set({
    meetingHue: config.meetingHue,
    meetingSat: config.meetingSat,
    meetingBri: config.meetingBri
  });

  showStatus('colorStatus', 'Settings saved!', 'success');
}

// Show status message
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

async function clearBridgeConfig() {
  // Clear all stored config
  await chrome.storage.local.remove([
    STORAGE_KEYS.BRIDGE_IP,
    STORAGE_KEYS.USERNAME,
    STORAGE_KEYS.LIGHT_ID,
    STORAGE_KEYS.PREVIOUS_LIGHT_STATE
  ]);

  // Reset config object
  config = {
    bridgeIp: '',
    username: '',
    lightId: '',
    meetingHue: config.meetingHue,
    meetingSat: config.meetingSat,
    meetingBri: config.meetingBri
  };

  // Reset UI
  document.getElementById('bridgeIp').value = '';
  document.getElementById('bridgeIp').placeholder = 'Discovering...';
  document.getElementById('bridgeIp').readOnly = true;
  document.getElementById('authenticateBtn').disabled = true;
  document.getElementById('usernameField').classList.add('hidden');
  document.getElementById('lightSection').classList.add('hidden');
  document.getElementById('colorSection').classList.add('hidden');

  showStatus('bridgeStatus', 'Bridge cleared. Click Rediscover to start over.', 'success');
  updateClearButtonVisibility();
}

function updateClearButtonVisibility() {
  const clearBtn = document.getElementById('clearBridgeBtn');
  if (config.bridgeIp && config.username) {
    clearBtn.style.display = 'block';
  } else {
    clearBtn.style.display = 'none';
  }
}

// Event listeners
document.getElementById('clearBridgeBtn').addEventListener('click', clearBridgeConfig);
document.getElementById('rediscoverBtn').addEventListener('click', discoverBridge);
document.getElementById('authenticateBtn').addEventListener('click', authenticate);
document.getElementById('testColorBtn').addEventListener('click', testColor);
document.getElementById('saveColorBtn').addEventListener('click', saveColor);

document.getElementById('hueSlider').addEventListener('input', updateColorPreview);
document.getElementById('satSlider').addEventListener('input', updateColorPreview);
document.getElementById('briSlider').addEventListener('input', updateColorPreview);

// Allow manual IP entry
document.getElementById('bridgeIp').addEventListener('change', (e) => {
  config.bridgeIp = e.target.value;
  document.getElementById('authenticateBtn').disabled = false;
  document.getElementById('usernameField').classList.remove('hidden');
});

// Initialize
(async () => {
  await loadConfig();

  if (config.bridgeIp) {
    document.getElementById('bridgeIp').value = config.bridgeIp;
    document.getElementById('authenticateBtn').disabled = false;
    document.getElementById('usernameField').classList.remove('hidden');

    if (config.username) {
      const authenticated = await testAuthentication();
      if (authenticated && config.lightId) {
        document.getElementById('colorSection').classList.remove('hidden');
      }
    }
  } else {
    discoverBridge();
  }
})();
