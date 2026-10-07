// Applies the saved theme before first paint so the page never flashes the wrong colors.
(function () {
  try {
    var t = localStorage.getItem('tk:theme');
    // Values are stored as JSON strings by app.js, e.g. "dark".
    t = t && JSON.parse(t);
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage unavailable: fall back to the system setting */ }
})();
