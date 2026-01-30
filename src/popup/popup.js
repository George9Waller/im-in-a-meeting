// Part A - current meeting stateHandle
const statusEl = document.getElementById('status');
const statusText = statusEl.querySelector('.status-text');

// Update meeting indicator in popup.html
function updateMeetingStateIndicator(inMeeting) {
  if (inMeeting) {
    statusEl.className = 'status in-meeting';
    statusText.textContent = 'IN MEETING';
  } else {
    statusEl.className = 'status not-in-meeting';
    statusText.textContent = 'AVAILABLE';
  }
}

// Fetch current meeting state from background.js
async function refreshMeetingState() {
  const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_STATUS });
  updateMeetingStateIndicator(response.inMeeting);
}

// Initial load
refreshMeetingState();
// Refresh meeting state every second
setInterval(refreshMeetingState, 1000);

// Part B - settings button
const settingsBtn = document.getElementById('settingsBtn');
settingsBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'settings/settings.html' });
});