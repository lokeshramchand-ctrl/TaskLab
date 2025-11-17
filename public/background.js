// background.js (MV3 Service Worker)
// This runs in the background and handles events like installation, updates, downloads, etc.

// Fired when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed and service worker running.");
});

// Optional: Listen to completed downloads
chrome.downloads.onChanged.addListener((downloadDelta) => {
  if (downloadDelta.state && downloadDelta.state.current === "complete") {
    console.log("A download has completed:", downloadDelta);
  }
});

// Optional: You can listen to messages from popup if needed
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PING") {
    console.log("Message received from popup:", msg);
    sendResponse({ status: "Background alive" });
  }
});
