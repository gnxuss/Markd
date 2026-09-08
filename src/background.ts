chrome.action.onClicked.addListener(() => {
  const libraryUrl = chrome.runtime.getURL("library.html");
  void chrome.tabs.create({ active: true, url: libraryUrl });
});
