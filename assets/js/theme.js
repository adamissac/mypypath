(function() {
  document.documentElement.classList.add('js-enabled');

  const STORAGE_KEY = 'pypath-theme';
  const FONTSCALE_KEY = 'pypath-fontscale';
  const COMPACT_KEY = 'pypath-compact';
  const CODETHEME_KEY = 'pypath-codetheme';
  const SIDEBAR_KEY = 'pypath-sidebar';
  const LEGACY_MOTION_KEY = 'pypath-motion';

  function getSystemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getStoredTheme() {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  function storeTheme(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
  }

  function clearLegacyMotionPreference() {
    try { localStorage.removeItem(LEGACY_MOTION_KEY); } catch {}
    delete document.documentElement.dataset.motion;
    delete document.body.dataset.motion;
  }

  function applyTheme(source) {
    document.documentElement.classList.add('theme-transitioning');
    const theme = source === 'system' ? getSystemTheme() : source;
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme, source } }));
    updateCodeThemes();
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 180);
  }

  function initThemeFromStorage() {
    clearLegacyMotionPreference();

    const source = getStoredTheme() || 'light';
    applyTheme(source);
    syncSettingsUI(source);

    const fs = loadFontScale();
    if (fs) applyFontScale(parseFloat(fs));

    applyCompact(loadSetting(COMPACT_KEY) || 'off');
    applyCodeTheme(loadSetting(CODETHEME_KEY) || 'auto');
    applySidebar(loadSetting(SIDEBAR_KEY) || 'auto');

    if (source === 'system' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme('system'));
    }
  }

  function enhanceSettingsA11y() {
    const toggleLabels = {
      'compact-toggle': 'Compact layout',
    };
    Object.keys(toggleLabels).forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.setAttribute('role', 'switch');
      input.setAttribute('aria-checked', String(input.checked));
      input.setAttribute('aria-label', toggleLabels[id]);
      input.addEventListener('change', () => {
        input.setAttribute('aria-checked', String(input.checked));
      });
    });

    document.querySelectorAll('.segmented[role="group"]').forEach((group) => {
      group.setAttribute('role', 'radiogroup');
    });
  }

  function syncSettingsUI(source) {
    document.querySelectorAll('input[name="theme"][type="radio"]').forEach((radio) => {
      radio.checked = radio.value === source;
      radio.addEventListener('change', () => {
        storeTheme(radio.value);
        applyTheme(radio.value);
      });
    });

    const fsRadios = document.querySelectorAll('input[name="fontscale"]');
    if (fsRadios.length) {
      const fs = parseFloat(loadFontScale() || '1');
      fsRadios.forEach((radio) => { radio.checked = parseFloat(radio.value) === fs; });
      fsRadios.forEach((radio) => radio.addEventListener('change', () => {
        saveFontScale(radio.value);
        applyFontScale(parseFloat(radio.value));
      }));
    }

    setupToggleSetting('compact-toggle', COMPACT_KEY, applyCompact);
    setupRadioSetting('codetheme', CODETHEME_KEY, applyCodeTheme);
    setupRadioSetting('sidebar', SIDEBAR_KEY, applySidebar);
    enhanceSettingsA11y();
  }

  function setupToggleSetting(id, storageKey, applyFn) {
    const toggle = document.getElementById(id);
    if (!toggle) return;
    toggle.checked = loadSetting(storageKey) === 'on';
    toggle.addEventListener('change', () => {
      const value = toggle.checked ? 'on' : 'off';
      saveSetting(storageKey, value);
      applyFn(value);
    });
  }

  function setupRadioSetting(name, storageKey, applyFn) {
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    if (!radios.length) return;
    const stored = loadSetting(storageKey) || radios[0].value;
    radios.forEach((radio) => { radio.checked = radio.value === stored; });
    radios.forEach((radio) => radio.addEventListener('change', () => {
      saveSetting(storageKey, radio.value);
      applyFn(radio.value);
    }));
  }

  function saveSetting(key, value) { try { localStorage.setItem(key, value); } catch {} }
  function loadSetting(key) { try { return localStorage.getItem(key); } catch { return null; } }

  function applyCompact(value) {
    document.body.classList.toggle('compact-layout', value === 'on');
    document.documentElement.dataset.compact = value;
  }

  function applyCodeTheme(value) {
    document.documentElement.dataset.codeTheme = value;
    updateCodeThemes();
  }

  function updateCodeThemes() {
    const siteTheme = document.documentElement.getAttribute('data-theme') || 'light';
    document.querySelectorAll('pre.code').forEach((el) => {
      el.dataset.theme = siteTheme;
    });
  }

  window.addEventListener('themechange', updateCodeThemes);

  function applySidebar(value) {
    document.documentElement.dataset.sidebar = value;
    if (value === 'hidden') {
      document.body.classList.add('sidebar-closed');
      try { localStorage.setItem('pypath-sidebar-closed', '1'); } catch {}
    } else if (value === 'always') {
      document.body.classList.remove('sidebar-closed');
      document.body.classList.remove('sidebar-open');
      try { localStorage.setItem('pypath-sidebar-closed', '0'); } catch {}
    }
  }

  function saveFontScale(value) { try { localStorage.setItem(FONTSCALE_KEY, String(value)); } catch {} }
  function loadFontScale() { try { return localStorage.getItem(FONTSCALE_KEY); } catch { return null; } }
  function applyFontScale(scale) {
    document.documentElement.style.setProperty('--font-scale', String(scale || 1));
  }

  window.PyTheme = { applyTheme, initThemeFromStorage, applyFontScale };

  document.addEventListener('DOMContentLoaded', initThemeFromStorage);
})();
