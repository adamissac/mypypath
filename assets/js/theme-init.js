/* Blocking theme init — include inline in <head> before CSS to prevent FOUC */
(function () {
  try {
    var stored = localStorage.getItem('pypath-theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.setAttribute('data-theme', stored);
    } else if (stored === 'system' && window.matchMedia) {
      document.documentElement.setAttribute(
        'data-theme',
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      );
    }
    if (sessionStorage.getItem('pypath-nav') === '1') {
      document.documentElement.classList.add('page-from-nav');
    }
  } catch (e) { /* ignore */ }
})();
// Course selection is independent of light/dark mode and storage availability.
(function () {
  var course = null;
  try { course = localStorage.getItem('pypath-course'); } catch (e) {}
  if (/^\/data(\.html$|\/)/.test(location.pathname)) course = 'data';
  else if (/^\/(curriculum\.html$|units\/)/.test(location.pathname)) course = 'foundations';
  if (course === 'data') document.documentElement.setAttribute('data-course', 'data');
  else document.documentElement.removeAttribute('data-course');
  if (course === 'data' || course === 'foundations') {
    try { localStorage.setItem('pypath-course', course); } catch (e) {}
  }
})();
