import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';

/* download-page.js is a plain IIFE (no import/top-level await), same as
   desktop-save-adapter.js, so it loads directly via
   new Function(source).call(window) with fetch and navigator mocked first —
   real behavior under test, not source-text assertions. */
const SRC = fs.readFileSync('assets/js/download-page.js', 'utf8');

const PAGE_HTML = `
  <p data-download-status>Checking the latest release…</p>
  <a data-download-primary href="https://github.com/adamissac/mypypath/releases">See releases</a>
  <a data-download="dmg" href="https://github.com/adamissac/mypypath/releases">macOS</a>
  <a data-download="msi" href="https://github.com/adamissac/mypypath/releases">Windows</a>
  <a data-download="AppImage" href="https://github.com/adamissac/mypypath/releases">Linux (AppImage)</a>
  <a data-download="deb" href="https://github.com/adamissac/mypypath/releases">Linux (.deb)</a>
`;

function asset(name, size) {
  return { name, size, browser_download_url: `https://github.com/adamissac/mypypath/releases/download/v0.1.0/${name}` };
}

function mockFetchOk(release) {
  window.fetch = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(release),
  }));
}

function mockFetchNotFound() {
  window.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));
}

function setPlatform(platform, userAgent) {
  Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true });
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent || '', configurable: true });
}

function run() {
  new Function(SRC).call(window);
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  document.body.innerHTML = PAGE_HTML;
  setPlatform('MacIntel', 'Mozilla/5.0 (Macintosh)');
});

afterEach(() => {
  delete window.fetch;
  document.body.innerHTML = '';
});

describe('no matching page', () => {
  it('does nothing when [data-download-status] is absent', async () => {
    document.body.innerHTML = '<p>unrelated page</p>';
    window.fetch = vi.fn();
    run();
    await flush();
    expect(window.fetch).not.toHaveBeenCalled();
  });
});

describe('no release published yet', () => {
  it('falls back to the releases page on a 404', async () => {
    mockFetchNotFound();
    run();
    await flush();

    expect(document.querySelector('[data-download-status]').textContent)
      .toMatch(/no downloadable build/i);
    const primary = document.querySelector('[data-download-primary]');
    expect(primary.textContent).toBe('View on GitHub');
    expect(primary.href).toBe('https://github.com/adamissac/mypypath/releases');
  });

  it('falls back the same way on a network failure', async () => {
    window.fetch = vi.fn(() => Promise.reject(new Error('offline')));
    run();
    await flush();
    expect(document.querySelector('[data-download-status]').textContent)
      .toMatch(/no downloadable build/i);
  });

  it('falls back when a release exists but has no matching assets at all', async () => {
    mockFetchOk({ tag_name: 'v0.1.0', assets: [asset('README.txt', 100)] });
    run();
    await flush();
    expect(document.querySelector('[data-download-status]').textContent)
      .toMatch(/no downloadable build/i);
  });
});

describe('a published release with assets', () => {
  const RELEASE = {
    tag_name: 'v0.1.0',
    assets: [
      asset('PyPath_0.1.0_aarch64.dmg', 16 * 1024 * 1024),
      asset('PyPath_0.1.0_x64-setup.msi', 12 * 1024 * 1024),
      asset('pypath_0.1.0_amd64.AppImage', 20 * 1024 * 1024),
      asset('pypath_0.1.0_amd64.deb', 10 * 1024 * 1024),
    ],
  };

  it('wires every platform link to its own asset', async () => {
    mockFetchOk(RELEASE);
    run();
    await flush();

    expect(document.querySelector('[data-download="dmg"]').href).toContain('PyPath_0.1.0_aarch64.dmg');
    expect(document.querySelector('[data-download="msi"]').href).toContain('setup.msi');
    expect(document.querySelector('[data-download="AppImage"]').href).toContain('.AppImage');
    expect(document.querySelector('[data-download="deb"]').href).toContain('.deb');
  });

  it('shows the version in the status line', async () => {
    mockFetchOk(RELEASE);
    run();
    await flush();
    expect(document.querySelector('[data-download-status]').textContent).toContain('v0.1.0');
  });

  it('highlights the macOS build as primary on a Mac', async () => {
    setPlatform('MacIntel', 'Mozilla/5.0 (Macintosh)');
    mockFetchOk(RELEASE);
    run();
    await flush();

    const primary = document.querySelector('[data-download-primary]');
    expect(primary.textContent).toMatch(/macOS.*16 MB/);
    expect(primary.href).toContain('.dmg');
  });

  it('highlights the Windows build as primary on Windows', async () => {
    setPlatform('Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    mockFetchOk(RELEASE);
    run();
    await flush();

    const primary = document.querySelector('[data-download-primary]');
    expect(primary.textContent).toMatch(/Windows/);
    expect(primary.href).toContain('.msi');
  });

  it('highlights the AppImage as primary on Linux, not on Android', async () => {
    setPlatform('Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)');
    mockFetchOk(RELEASE);
    run();
    await flush();
    expect(document.querySelector('[data-download-primary]').href).toContain('.AppImage');

    document.body.innerHTML = PAGE_HTML;
    setPlatform('Linux armv8l', 'Mozilla/5.0 (Linux; Android 14)');
    run();
    await flush();
    // Android reports a Linux platform string too; the point of the UA check
    // is that a phone never gets offered a desktop AppImage as "yours".
    expect(document.querySelector('[data-download-primary]').href)
      .toBe('https://github.com/adamissac/mypypath/releases');
  });

  it('falls back to "see all downloads" on an unrecognized platform', async () => {
    setPlatform('iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)');
    mockFetchOk(RELEASE);
    run();
    await flush();

    const primary = document.querySelector('[data-download-primary]');
    expect(primary.textContent).toBe('See all downloads');
    expect(primary.href).toBe('https://github.com/adamissac/mypypath/releases');
  });
});
