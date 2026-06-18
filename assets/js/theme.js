(function() {
  // mark JS-enabled for progressive enhancement
  document.documentElement.classList.add('js-enabled');
  const STORAGE_KEY = "pypath-theme"; // values: 'light' | 'dark' | 'system'
  const MOTION_KEY = "pypath-motion"; // values: 'on' | 'off'
  const ACCENT_KEY = "pypath-accent"; // hex color
  const FONTSCALE_KEY = "pypath-fontscale"; // number as string
  const TOOLTIPS_KEY = "pypath-tooltips"; // 'on' | 'off'
  const COMPACT_KEY = "pypath-compact"; // 'on' | 'off'
  const FOCUS_KEY = "pypath-focus"; // 'on' | 'off'
  const NOTIFICATIONS_KEY = "pypath-notifications"; // 'on' | 'off'
  const AUTOSAVE_KEY = "pypath-autosave"; // 'on' | 'off'
  const SHORTCUTS_KEY = "pypath-shortcuts"; // 'on' | 'off'
  const CODETHEME_KEY = "pypath-codetheme"; // 'light' | 'dark' | 'auto'
  const SIDEBAR_KEY = "pypath-sidebar"; // 'always' | 'auto' | 'hidden'
  const REMINDERS_KEY = "pypath-reminders"; // 'on' | 'off'

  function getSystemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getStoredTheme() {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  function storeTheme(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
  }

  function getMotion() {
    try { return localStorage.getItem(MOTION_KEY) || 'on'; } catch { return 'on'; }
  }

  function setMotion(value) {
    try { localStorage.setItem(MOTION_KEY, value); } catch {}
    document.documentElement.dataset.motion = value;
    document.body.dataset.motion = value;
    document.documentElement.classList.toggle('reduced-motion', value === 'off');
  }

  function applyTheme(source) {
    document.documentElement.classList.add('theme-transitioning');
    const theme = source === 'system' ? getSystemTheme() : source;
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    const event = new CustomEvent('themechange', { detail: { theme, source } });
    window.dispatchEvent(event);
    updateCodeThemes();
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 180);
  }

  function initThemeFromStorage() {
    const stored = getStoredTheme();
    // Default to 'light' for all new users, only use stored preference if it exists
    const source = stored || 'light';
    applyTheme(source);
    syncSettingsUI(source);
    setMotion(getMotion());
    // accent
    const accent = loadAccent();
    if (accent) applyAccent(accent);
    // font scale
    const fs = loadFontScale();
    if (fs) applyFontScale(parseFloat(fs));
    // tooltips flag
    const tips = loadTooltips();
    if (tips) applyTooltips(tips);
    // load all other settings
    loadAndApplySettings();
    // reactive to system changes when in system mode
    if (source === 'system' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', () => applyTheme('system'));
    }
  }

  function enhanceSettingsA11y() {
    const toggleLabels = {
      'motion-toggle': 'Animated UI',
      'tooltips-toggle': 'Tooltips',
      'compact-toggle': 'Compact layout',
      'focus-toggle': 'Focus mode',
      'notifications-toggle': 'Progress notifications',
      'autosave-toggle': 'Auto-save progress',
      'shortcuts-toggle': 'Keyboard shortcuts',
      'reminders-toggle': 'Study reminders',
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
    const radios = document.querySelectorAll('input[name="theme"][type="radio"]');
    radios.forEach(r => {
      r.checked = r.value === source;
      r.addEventListener('change', () => {
        storeTheme(r.value);
        applyTheme(r.value);
      });
    });
    const motionToggle = document.getElementById('motion-toggle');
    if (motionToggle) {
      motionToggle.checked = getMotion() !== 'off';
      motionToggle.addEventListener('change', () => setMotion(motionToggle.checked ? 'on' : 'off'));
    }

    const accentInput = document.getElementById('accent-picker');
    if (accentInput) {
      const current = loadAccent() || '#4f46e5';
      accentInput.value = current;
      accentInput.addEventListener('input', () => {
        saveAccent(accentInput.value);
        applyAccent(accentInput.value);
      });
    }

    const fsRadios = document.querySelectorAll('input[name="fontscale"]');
    if (fsRadios.length) {
      const fs = parseFloat(loadFontScale() || '1');
      fsRadios.forEach(r => { r.checked = parseFloat(r.value) === fs; });
      fsRadios.forEach(r => r.addEventListener('change', () => {
        saveFontScale(r.value);
        applyFontScale(parseFloat(r.value));
      }));
    }

    const tipsToggle = document.getElementById('tooltips-toggle');
    if (tipsToggle) {
      tipsToggle.checked = (loadTooltips() || 'on') === 'on';
      tipsToggle.addEventListener('change', () => {
        const v = tipsToggle.checked ? 'on' : 'off';
        saveTooltips(v); applyTooltips(v);
      });
    }

    // New settings handlers
    setupToggleSetting('compact-toggle', COMPACT_KEY, applyCompact);
    setupToggleSetting('focus-toggle', FOCUS_KEY, applyFocus);
    setupToggleSetting('notifications-toggle', NOTIFICATIONS_KEY, applyNotifications);
    setupToggleSetting('autosave-toggle', AUTOSAVE_KEY, applyAutosave);
    setupToggleSetting('shortcuts-toggle', SHORTCUTS_KEY, applyShortcuts);
    setupToggleSetting('reminders-toggle', REMINDERS_KEY, applyReminders);

    setupRadioSetting('codetheme', CODETHEME_KEY, applyCodeTheme);
    setupRadioSetting('sidebar', SIDEBAR_KEY, applySidebar);
    enhanceSettingsA11y();
  }

  function setupToggleSetting(id, storageKey, applyFn) {
    const toggle = document.getElementById(id);
    if (!toggle) return;
    const stored = loadSetting(storageKey);
    toggle.checked = stored !== 'off';
    toggle.addEventListener('change', () => {
      const v = toggle.checked ? 'on' : 'off';
      saveSetting(storageKey, v);
      applyFn(v);
    });
  }

  function setupRadioSetting(name, storageKey, applyFn) {
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    if (!radios.length) return;
    const stored = loadSetting(storageKey) || radios[0].value;
    radios.forEach(r => { r.checked = r.value === stored; });
    radios.forEach(r => r.addEventListener('change', () => {
      saveSetting(storageKey, r.value);
      applyFn(r.value);
    }));
  }

  function loadAndApplySettings() {
    applyCompact(loadSetting(COMPACT_KEY) || 'off');
    applyFocus(loadSetting(FOCUS_KEY) || 'off');
    applyNotifications(loadSetting(NOTIFICATIONS_KEY) || 'on');
    applyAutosave(loadSetting(AUTOSAVE_KEY) || 'on');
    applyShortcuts(loadSetting(SHORTCUTS_KEY) || 'on');
    applyCodeTheme(loadSetting(CODETHEME_KEY) || 'auto');
    applySidebar(loadSetting(SIDEBAR_KEY) || 'auto');
    applyReminders(loadSetting(REMINDERS_KEY) || 'off');
  }

  function saveSetting(key, value) { try { localStorage.setItem(key, value); } catch {} }
  function loadSetting(key) { try { return localStorage.getItem(key); } catch { return null; } }

  function applyCompact(v) {
    document.body.classList.toggle('compact-layout', v === 'on');
    document.documentElement.dataset.compact = v;
  }

  function applyFocus(v) {
    document.body.classList.toggle('focus-mode', v === 'on');
    document.documentElement.dataset.focus = v;
  }

  function applyNotifications(v) {
    document.documentElement.dataset.notifications = v;
  }

  function applyAutosave(v) {
    document.documentElement.dataset.autosave = v;
  }

  function applyShortcuts(v) {
    document.documentElement.dataset.shortcuts = v;
  }

  function applyCodeTheme(v) {
    document.documentElement.dataset.codeTheme = v;
    updateCodeThemes();
  }

  function updateCodeThemes() {
    const siteTheme = document.documentElement.getAttribute('data-theme') || 'light';
    document.querySelectorAll('pre.code').forEach(el => {
      el.dataset.theme = siteTheme;
    });
  }

  // Update code themes when system theme changes in auto mode
  window.addEventListener('themechange', () => {
    updateCodeThemes();
  });

  function applySidebar(v) {
    document.documentElement.dataset.sidebar = v;
    if (v === 'hidden') {
      document.body.classList.add('sidebar-closed');
      try { localStorage.setItem('pypath-sidebar-closed', '1'); } catch {}
    } else if (v === 'always') {
      document.body.classList.remove('sidebar-closed');
      document.body.classList.remove('sidebar-open');
      try { localStorage.setItem('pypath-sidebar-closed', '0'); } catch {}
    }
  }

  function applyReminders(v) {
    document.documentElement.dataset.reminders = v;
  }

  function saveAccent(hex) { try { localStorage.setItem(ACCENT_KEY, hex); } catch {} }
  function loadAccent() { try { return localStorage.getItem(ACCENT_KEY); } catch { return null; } }
  function applyAccent(hex) {
    document.documentElement.style.setProperty('--primary', hex);
    document.documentElement.style.setProperty('--gradient', hex);
    document.body && document.body.style && document.body.style.setProperty('--primary', hex);
    document.body && document.body.style && document.body.style.setProperty('--gradient', hex);
  }

  function saveFontScale(v) { try { localStorage.setItem(FONTSCALE_KEY, String(v)); } catch {} }
  function loadFontScale() { try { return localStorage.getItem(FONTSCALE_KEY); } catch { return null; } }
  function applyFontScale(scale) { document.documentElement.style.setProperty('--font-scale', String(scale || 1)); }

  function saveTooltips(v) { try { localStorage.setItem(TOOLTIPS_KEY, v); } catch {} }
  function loadTooltips() { try { return localStorage.getItem(TOOLTIPS_KEY); } catch { return null; } }
  function applyTooltips(v) { document.body.dataset.tooltips = v; }

  // Expose minimal API
  window.PyTheme = { applyTheme, initThemeFromStorage, applyAccent, applyFontScale };

  // Init ASAP
  document.addEventListener('DOMContentLoaded', initThemeFromStorage);
})();



