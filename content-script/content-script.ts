(async() => {
  // Dynamically import JS
  await import(chrome.runtime.getURL("assets/content-main.js"));
})()