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
// Course selection works without storage; the mode a course arrives in needs it.
(function () {
  var stored = null;
  try { stored = localStorage.getItem('pypath-course'); } catch (e) {}
  var here = null;
  if (/^\/data(\.html$|\/)/.test(location.pathname)) here = 'data';
  else if (/^\/(curriculum\.html$|units\/)/.test(location.pathname)) here = 'foundations';
  var course = here || stored;
  if (course === 'data') document.documentElement.setAttribute('data-course', 'data');
  else document.documentElement.removeAttribute('data-course');
  if (course === 'data' || course === 'foundations') {
    try { localStorage.setItem('pypath-course', course); } catch (e) {}
  }
  /* Each course carries a mode as well as a palette — Data is a night survey,
     Foundations is daylight — and it is applied on the way IN, not on every
     page of the course. Stamping it on each load would overrule the theme
     control in settings on the very next click inside the course. Remembering
     it as the theme preference is what keeps that control in agreement. */
  if (here && here !== stored) {
    var mode = here === 'data' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', mode);
    try { localStorage.setItem('pypath-theme', mode); } catch (e) {}
  }
})();
