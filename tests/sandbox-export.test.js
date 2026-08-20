import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  const src = fs.readFileSync('assets/js/sandbox.js', 'utf8');
  new Function(src).call(window);
});

describe('sanitizeBase', () => {
  it('keeps an already-safe name untouched', () => {
    expect(window.SandboxExport.sanitizeBase('my_script')).toBe('my_script');
  });

  it('collapses whitespace into underscores', () => {
    expect(window.SandboxExport.sanitizeBase('My   First Script')).toBe('My_First_Script');
  });

  it('strips path separators so a name cannot escape the download folder', () => {
    expect(window.SandboxExport.sanitizeBase('../../etc/passwd')).toBe('etc_passwd');
    expect(window.SandboxExport.sanitizeBase('C:\\Users\\me\\thing')).toBe('C_Users_me_thing');
  });

  it('strips control characters', () => {
    expect(window.SandboxExport.sanitizeBase('bad\u0000na\u001fme\u007f')).toBe('badname');
  });

  it('strips characters Windows rejects in filenames', () => {
    expect(window.SandboxExport.sanitizeBase('a<b>c:d"e|f?g*h')).toBe('abcdefgh');
  });

  it('strips leading dots so the file is not hidden', () => {
    expect(window.SandboxExport.sanitizeBase('...hidden')).toBe('hidden');
  });

  it('drops a redundant extension so it is not doubled up', () => {
    expect(window.SandboxExport.sanitizeBase('report.py')).toBe('report');
    expect(window.SandboxExport.sanitizeBase('report.TXT')).toBe('report');
  });

  it('falls back when the name sanitizes to nothing', () => {
    expect(window.SandboxExport.sanitizeBase('')).toBe('sketch');
    expect(window.SandboxExport.sanitizeBase('   ')).toBe('sketch');
    expect(window.SandboxExport.sanitizeBase('...')).toBe('sketch');
    expect(window.SandboxExport.sanitizeBase('<<<>>>')).toBe('sketch');
  });

  it('falls back for a non-string', () => {
    expect(window.SandboxExport.sanitizeBase(null)).toBe('sketch');
    expect(window.SandboxExport.sanitizeBase(undefined)).toBe('sketch');
    expect(window.SandboxExport.sanitizeBase(42)).toBe('sketch');
  });

  it('falls back for Windows reserved device names', () => {
    expect(window.SandboxExport.sanitizeBase('CON')).toBe('sketch');
    expect(window.SandboxExport.sanitizeBase('nul')).toBe('sketch');
    expect(window.SandboxExport.sanitizeBase('com3')).toBe('sketch');
  });

  it('caps the length and never leaves a trailing separator behind', () => {
    const long = window.SandboxExport.sanitizeBase('a'.repeat(200));
    expect(long).toHaveLength(window.SandboxExport.MAX_BASE_LENGTH);

    const trimmed = window.SandboxExport.sanitizeBase('b'.repeat(63) + '_tail');
    expect(trimmed.endsWith('_')).toBe(false);
  });
});

describe('filenameFor', () => {
  it('appends the extension to the sanitized base', () => {
    expect(window.SandboxExport.filenameFor('My Script', 'py')).toBe('My_Script.py');
    expect(window.SandboxExport.filenameFor('My Script', 'txt')).toBe('My_Script.txt');
  });

  it('accepts an extension with or without the leading dot', () => {
    expect(window.SandboxExport.filenameFor('x', '.py')).toBe('x.py');
  });

  it('does not double an extension already in the project name', () => {
    expect(window.SandboxExport.filenameFor('notes.py', 'py')).toBe('notes.py');
  });

  it('uses the fallback base for an unusable name', () => {
    expect(window.SandboxExport.filenameFor('/', 'py')).toBe('sketch.py');
  });
});

describe('buildPyContent', () => {
  it('emits the code and nothing else, so the file stays runnable', () => {
    expect(window.SandboxExport.buildPyContent('print(1)')).toBe('print(1)\n');
  });

  it('does not add a second trailing newline', () => {
    expect(window.SandboxExport.buildPyContent('print(1)\n')).toBe('print(1)\n');
  });

  it('normalizes CRLF', () => {
    expect(window.SandboxExport.buildPyContent('a\r\nb')).toBe('a\nb\n');
  });

  it('leaves an empty buffer empty', () => {
    expect(window.SandboxExport.buildPyContent('')).toBe('');
    expect(window.SandboxExport.buildPyContent(null)).toBe('');
  });
});

describe('buildTextContent', () => {
  it('leads with the filename and the code', () => {
    const text = window.SandboxExport.buildTextContent({ name: 'My Script', code: 'print(1)' });
    expect(text.startsWith('My_Script.py\n')).toBe(true);
    expect(text).toContain('print(1)');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('appends the last run output when there is some', () => {
    const text = window.SandboxExport.buildTextContent({
      name: 'demo',
      code: 'print(1)',
      output: '1\n',
    });
    expect(text).toContain('--- Output ---');
    expect(text.indexOf('print(1)')).toBeLessThan(text.indexOf('--- Output ---'));
  });

  it('omits the output section entirely when nothing has been run', () => {
    const text = window.SandboxExport.buildTextContent({ name: 'demo', code: 'print(1)' });
    expect(text).not.toContain('--- Output ---');
  });

  it('treats whitespace-only output as no output', () => {
    const text = window.SandboxExport.buildTextContent({ name: 'demo', code: 'x', output: '\n\n  ' });
    expect(text).not.toContain('--- Output ---');
  });
});

describe('buildPrintHtml', () => {
  it('renders the title, code and output', () => {
    const html = window.SandboxExport.buildPrintHtml({
      name: 'demo',
      code: 'print(1)',
      output: '1',
    });
    expect(html).toContain('demo.py');
    expect(html).toContain('sandbox-print-code');
    expect(html).toContain('sandbox-print-output');
    expect(html).toContain('>Output<');
  });

  it('omits the output block when nothing has been run', () => {
    const html = window.SandboxExport.buildPrintHtml({ name: 'demo', code: 'print(1)' });
    expect(html).not.toContain('sandbox-print-output');
    expect(html).not.toContain('>Output<');
  });

  it('escapes code so it cannot break out of the print view', () => {
    const html = window.SandboxExport.buildPrintHtml({
      name: 'demo',
      code: 'x = "<script>alert(1)</script>" & 2',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
  });

  it('includes the timestamp only when one is supplied', () => {
    expect(
      window.SandboxExport.buildPrintHtml({ name: 'demo', code: 'x', date: '1 Jan 2026' })
    ).toContain('1 Jan 2026');
    expect(window.SandboxExport.buildPrintHtml({ name: 'demo', code: 'x' })).not.toContain(
      'sandbox-print-meta'
    );
  });
});

// core.js runs on every page and used to bind the settings backup to a bare
// #export-btn. The sandbox caret claimed that id in good faith and inherited
// the handler, so opening the menu downloaded pypath-settings.json. Both
// halves of that fix are pinned here.
describe('the export caret does not collide with the settings backup', () => {
  it('gives the sandbox trigger a page-specific id', () => {
    const html = fs.readFileSync('sandbox.html', 'utf8');
    expect(html).toContain('id="sandbox-export-btn"');
    expect(html).not.toContain('id="export-btn"');
  });

  it('scopes the settings backup handler to the settings page', () => {
    const src = fs.readFileSync('assets/js/core.js', 'utf8');
    const fn = src.slice(src.indexOf('function setupSettingsActions()'));
    const guard = fn.indexOf("classList.contains('page-settings')");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(fn.indexOf("qs('#export-btn')"));
  });
});

describe('buildIpynbContent', () => {
  const parse = (opts) => JSON.parse(window.SandboxExport.buildIpynbContent(opts));

  it('emits a valid nbformat 4 notebook with one code cell', () => {
    const nb = parse({ code: 'print("hi")' });
    expect(nb.nbformat).toBe(4);
    expect(nb.metadata.kernelspec.name).toBe('python3');
    expect(nb.cells).toHaveLength(1);
    expect(nb.cells[0].cell_type).toBe('code');
  });

  it('splits source into per-line strings that keep their newline', () => {
    const nb = parse({ code: 'a = 1\nb = 2' });
    expect(nb.cells[0].source).toEqual(['a = 1\n', 'b = 2']);
  });

  it('leaves an unrun cell with a null execution count and no outputs', () => {
    const nb = parse({ code: 'x' });
    expect(nb.cells[0].execution_count).toBeNull();
    expect(nb.cells[0].outputs).toEqual([]);
  });

  it('carries the last run output as a stdout stream', () => {
    const nb = parse({ code: 'print(1)', output: '1\n' });
    expect(nb.cells[0].execution_count).toBe(1);
    expect(nb.cells[0].outputs).toEqual([
      { output_type: 'stream', name: 'stdout', text: ['1'] },
    ]);
  });

  it('normalizes CRLF so the notebook never carries stray carriage returns', () => {
    const nb = parse({ code: 'a\r\nb' });
    expect(nb.cells[0].source).toEqual(['a\n', 'b']);
  });

  it('handles an empty buffer without inventing a blank line', () => {
    expect(parse({ code: '' }).cells[0].source).toEqual([]);
  });

  it('names the download .ipynb', () => {
    expect(window.SandboxExport.filenameFor('my notebook', 'ipynb')).toBe('my_notebook.ipynb');
    expect(window.SandboxExport.filenameFor('thing.ipynb', 'ipynb')).toBe('thing.ipynb');
  });
});
