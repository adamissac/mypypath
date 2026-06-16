(function () {
  'use strict';

  function reduced() {
    return window.PyMotion && window.PyMotion.prefersReduced();
  }

  function parseLayers() {
    var raw = document.body.getAttribute('data-bg') || '';
    return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function mountLayers() {
    if (reduced()) return null;
    var layers = parseLayers();
    if (layers.indexOf('aurora') === -1) return null;

    var root = document.createElement('div');
    root.className = 'bg-layers';
    root.setAttribute('aria-hidden', 'true');

    var el = document.createElement('div');
    el.className = 'bg-layer bg-layer--aurora';
    var orb = document.createElement('div');
    orb.className = 'bg-aurora-orb';
    orb.setAttribute('aria-hidden', 'true');
    el.appendChild(orb);
    root.appendChild(el);

    document.body.insertBefore(root, document.body.firstChild);
    return root;
  }

  document.addEventListener('DOMContentLoaded', mountLayers);
})();
