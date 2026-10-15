chrome.app.runtime.onLaunched.addListener(function () {
  chrome.app.window.create('main.html', {
    id: 'speaker',
    innerBounds: { width: 420, height: 640, minWidth: 360, minHeight: 520 }
  });
});
