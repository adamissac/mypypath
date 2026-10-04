/* The one-minute tour video on the homepage.
 *
 * Nothing about it downloads until it is wanted. The video is preload="none",
 * and the cover image is fetched only once the frame is on screen, so a
 * visitor who never scrolls this far pays nothing for it. The home page sits
 * at the edge of its own-bytes budget (scripts/verify-perf-budget.mjs), and an
 * 11MB film or a 67KB poster on the load path would have been most of it.
 *
 * Without this script the <video> keeps its native controls and the cover
 * button stays hidden, so the tour still plays.
 */
(function () {
  'use strict';

  var frame = document.querySelector('[data-tour]');
  if (!frame) return;
  var video = frame.querySelector('video');
  var cover = frame.querySelector('[data-tour-play]');
  var poster = frame.querySelector('[data-tour-poster]');
  var label = frame.querySelector('[data-tour-label]');
  if (!video || !cover) return;

  function loadPoster() {
    if (!poster || poster.getAttribute('src')) return;
    poster.addEventListener('load', function () { poster.classList.add('is-loaded'); }, { once: true });
    poster.setAttribute('src', poster.getAttribute('data-src'));
  }

  function showCover() {
    video.removeAttribute('controls');
    cover.hidden = false;
  }

  function hideCover() {
    cover.hidden = true;
    video.setAttribute('controls', '');
  }

  function play() {
    hideCover();
    video.focus({ preventScroll: true });
    var started = video.play();
    // If the browser refuses, the native controls are already showing.
    if (started && typeof started.catch === 'function') started.catch(function () {});
  }

  showCover();

  if ('IntersectionObserver' in window) {
    var onScreen = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        loadPoster();
        onScreen.disconnect();
      }
    });
    onScreen.observe(frame);
  } else {
    loadPoster();
  }

  cover.addEventListener('click', play);
  video.addEventListener('play', hideCover);
  video.addEventListener('ended', function () {
    if (label) label.textContent = 'Watch it again';
    showCover();
    cover.focus({ preventScroll: true });
  });
})();
