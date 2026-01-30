function isInMeeting() {
  // use XPath to find the icon with 'call_end' text
  const callEndIcon = document.evaluate(
    "//i[contains(@class, 'google-symbols') and text()='call_end']",
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  ).singleNodeValue;

  return callEndIcon !== null;
}

function checkAndNotify() {
  const inMeeting = isInMeeting();
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.MEETING_STATUS,
    inMeeting: inMeeting
  });
}

// Check immediately
checkAndNotify();

// Monitor for changes (joining/leaving meeting)
const observer = new MutationObserver(() => {
  checkAndNotify();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
