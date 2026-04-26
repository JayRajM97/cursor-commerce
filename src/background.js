chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    hesitateFitAssistantInstalledAt: Date.now()
  });
});
