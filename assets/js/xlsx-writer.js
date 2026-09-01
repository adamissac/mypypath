/* PyPath — a small .xlsx writer.
 *
 * WHY THIS IS HERE AND NOT A DEPENDENCY. This repo has no runtime
 * dependencies, and classroom-export.js says why in its own header: "a CSV
 * writer is thirty lines and a dependency is forever." Reversing that for a
 * spreadsheet export was considered properly rather than waved through, and
 * the standard choice was measured before it was declined. SheetJS's `xlsx`
 * is the obvious library and it was tried:
 *
 *   - Cell styles are silently dropped. Setting `cell.s = {font:{bold:true}}`
 *     produces a styles.xml with a single unstyled Calibri font and no `s`
 *     attribute on any cell. Styling is a Pro feature; the free build ignores
 *     it without erroring.
 *   - Freeze panes are silently dropped too. `ws['!freeze']` produced
 *     `<sheetView workbookViewId="0"/>` with no <pane> element.
 *   - Column widths are the one thing that did work.
 *
 * A frozen header row and a styled mastery mark were the reasons to want a
 * real .xlsx over the CSV that already exists, so a library that drops both is
 * not buying what it costs. Two further facts settled it: npm's `xlsx` is
 * frozen at 0.18.5 (published 2022, the only version on the registry) and
 * carries two open advisories -- GHSA-4r6h-8v6p-xvw6 (prototype pollution) and
 * GHSA-5pgg-2g8v-p4x9 (ReDoS) -- whose fixes live only on SheetJS's own CDN,
 * off-registry; and the full browser build is roughly 900KB on a dashboard
 * that currently loads none of it.
 *
 * What is actually needed is bounded: several sheets, text and number cells, a
 * frozen header, column widths, and a handful of fills. That is an XML file
 * per sheet inside a ZIP, and this file is that.
 *
 * WHAT THIS IS NOT. Not a spreadsheet library. It writes; it never reads. It
 * has no formulas, no dates as dates, no merges, no charts. Anything beyond
 * "rows of text and numbers, styled a little" belongs in a real library, and
 * at that point the trade above should be made again rather than this file
 * grown to meet it.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------ plumbing */

  var ENC = typeof TextEncoder === 'function' ? new TextEncoder() : null;

  function utf8(str) {
    if (ENC) return ENC.encode(str);
    // Node's jsdom always has TextEncoder; this is for a browser old enough
    // not to, where a mangled export beats a thrown error on a teacher's
    // download click.
    var out = [];
    for (var i = 0; i < str.length; i += 1) out.push(str.charCodeAt(i) & 0xff);
    return new Uint8Array(out);
  }

  /* XML text escaping. Student display names are user-controlled and land in
     every sheet, so this is the same class of guard as csvField()'s quoting --
     a name containing & or < must not end the document. */
  function xmlText(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Control characters are not legal in XML 1.0 at all, and Excel refuses
      // to open a file containing one. Tab, newline and return are legal.
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  }

  function xmlAttr(value) {
    return xmlText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n += 1) {
      var c = n;
      for (var k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i += 1) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  /* A ZIP container, stored rather than deflated.
   *
   * Method 0 (store) is a legal ZIP and Excel opens it. It costs file size --
   * XML compresses extremely well, so a deflated .xlsx is perhaps a fifth of
   * this one -- and it buys not shipping a DEFLATE implementation. For a class
   * of forty that is a few hundred KB written to the teacher's own disk and
   * never uploaded anywhere, which is the right side of that trade. If these
   * files ever need to be mailed or stored at scale, add compression here
   * rather than working around the size elsewhere. */
  function zip(files) {
    var chunks = [];
    var central = [];
    var offset = 0;

    function u16(n) { return [n & 0xff, (n >>> 8) & 0xff]; }
    function u32(n) { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; }

    files.forEach(function (file) {
      var nameBytes = utf8(file.name);
      var data = file.bytes;
      var sum = crc32(data);

      // Bit 11 marks the name as UTF-8. Every name here is ASCII, but saying
      // so costs nothing and is correct rather than incidentally correct.
      var flags = 0x0800;
      var header = []
        .concat(u32(0x04034b50), u16(20), u16(flags), u16(0), u16(0), u16(0))
        .concat(u32(sum), u32(data.length), u32(data.length))
        .concat(u16(nameBytes.length), u16(0));

      chunks.push(new Uint8Array(header), nameBytes, data);

      central.push([]
        .concat(u32(0x02014b50), u16(20), u16(20), u16(flags), u16(0), u16(0), u16(0))
        .concat(u32(sum), u32(data.length), u32(data.length))
        .concat(u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0))
        .concat(u32(0), u32(offset))
        .concat(Array.prototype.slice.call(nameBytes)));

      offset += header.length + nameBytes.length + data.length;
    });

    var dirBytes = [];
    central.forEach(function (entry) { dirBytes = dirBytes.concat(entry); });
    var dir = new Uint8Array(dirBytes);

    var end = new Uint8Array([]
      .concat(u32(0x06054b50), u16(0), u16(0))
      .concat(u16(files.length), u16(files.length))
      .concat(u32(dir.length), u32(offset), u16(0)));

    chunks.push(dir, end);

    var total = chunks.reduce(function (n, c) { return n + c.length; }, 0);
    var out = new Uint8Array(total);
    var at = 0;
    chunks.forEach(function (c) { out.set(c, at); at += c.length; });
    return out;
  }

  /* ---------------------------------------------------------- the sheets */

  var HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  function colName(index) {
    var name = '';
    var n = index;
    while (n >= 0) {
      name = String.fromCharCode(65 + (n % 26)) + name;
      n = Math.floor(n / 26) - 1;
    }
    return name;
  }

  /* The style table.
   *
   * Deliberately tiny and fixed rather than computed: five named styles cover
   * every sheet this app writes, and a general style engine is exactly the
   * scope creep the header warns about.
   *
   * Order matters -- a cell's `s` attribute is an index into cellXfs. The
   * names below map to those indices in STYLE.
   */
  var STYLE = { plain: 0, header: 1, strong: 2, muted: 3, mark: 4 };

  function stylesXml() {
    return HEAD +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="4">' +
        '<font><sz val="11"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="11"/><color rgb="FF0C4566"/><name val="Calibri"/></font>' +
        '<font><sz val="11"/><color rgb="FF6B7B88"/><name val="Calibri"/></font>' +
      '</fonts>' +
      '<fills count="4">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFE8F4FB"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF3F6F8"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="2">' +
        '<border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border><left/><right/><top/><bottom style="thin"><color rgb="FFB9D3E2"/></bottom><diagonal/></border>' +
      '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5">' +
        // 0 plain
        '<xf xfId="0" numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1">' +
          '<alignment vertical="top" wrapText="0"/></xf>' +
        // 1 header
        '<xf xfId="0" numFmtId="0" fontId="2" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
          '<alignment vertical="bottom" wrapText="0"/></xf>' +
        // 2 strong
        '<xf xfId="0" numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>' +
        // 3 muted
        '<xf xfId="0" numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1"/>' +
        // 4 mark -- a shaded cell for a state worth spotting down a column
        '<xf xfId="0" numFmtId="0" fontId="0" fillId="3" borderId="0" applyFill="1"/>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  /* A cell.
   *
   * Text is written as an inline string: `t="inlineStr"` with the value inside
   * <is><t>. That is the formula-injection guard for this format, and it is
   * structural rather than textual. A formula in xlsx lives in an <f> element;
   * a value that merely starts with "=" has nowhere to become one. So a
   * student named "=cmd|..." arrives in Excel as those literal characters.
   *
   * Note this is deliberately NOT csvField()'s guard. That one prefixes an
   * apostrophe, which is Excel's *input* convention -- typing '=1 gives you
   * the text =1. Stored in a cell value the apostrophe is just a character and
   * would show up in the sheet, so applying the CSV rule here would corrupt
   * every name it touched to fix a hole this format does not have.
   */
  function cellXml(ref, value, style) {
    var s = style ? ' s="' + style + '"' : '';
    if (value == null || value === '') return '<c r="' + ref + '"' + s + '/>';
    if (typeof value === 'number' && isFinite(value)) {
      return '<c r="' + ref + '"' + s + '><v>' + value + '</v></c>';
    }
    // xml:space="preserve" so a value that is or ends in a space survives.
    return '<c r="' + ref + '" t="inlineStr"' + s + '><is><t xml:space="preserve">' +
      xmlText(value) + '</t></is></c>';
  }

  function normalizeCell(cell) {
    if (cell && typeof cell === 'object' && !(cell instanceof Date)) {
      return { v: cell.v, s: cell.s || 0 };
    }
    return { v: cell, s: 0 };
  }

  function sheetXml(sheet) {
    var rows = sheet.rows || [];
    var widths = sheet.widths || [];
    var xml = HEAD + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';

    /* The frozen header row: the reason a teacher wanted a real spreadsheet
       rather than the CSV that already existed. Row 1 stays put while the
       class scrolls, so column 14 is still labelled at student thirty. */
    xml += '<sheetViews><sheetView workbookViewId="0">';
    if (sheet.freezeHeader !== false && rows.length > 1) {
      xml += '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
        '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';
    }
    xml += '</sheetView></sheetViews>';

    if (widths.length) {
      xml += '<cols>';
      widths.forEach(function (w, i) {
        xml += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      });
      xml += '</cols>';
    }

    xml += '<sheetData>';
    rows.forEach(function (row, r) {
      xml += '<row r="' + (r + 1) + '">';
      (row || []).forEach(function (raw, c) {
        var cell = normalizeCell(raw);
        // Row 1 is the header unless the sheet says it has none.
        var style = cell.s || (r === 0 && sheet.freezeHeader !== false ? STYLE.header : 0);
        xml += cellXml(colName(c) + (r + 1), cell.v, style);
      });
      xml += '</row>';
    });
    xml += '</sheetData>';

    /* Without this Excel puts a green warning triangle on every text cell that
       looks like a number -- a whole column of them on any sheet with a date
       or a percentage written as text. It is noise about our own formatting
       choice, shown to the teacher as though their data were wrong. */
    if (rows.length) {
      xml += '<ignoredErrors><ignoredError sqref="A1:' +
        colName(Math.max(0, maxWidth(rows) - 1)) + rows.length +
        '" numberStoredAsText="1"/></ignoredErrors>';
    }

    return xml + '</worksheet>';
  }

  function maxWidth(rows) {
    return rows.reduce(function (n, row) {
      return Math.max(n, (row || []).length);
    }, 1);
  }

  /* Excel's own limits on a sheet name, enforced here because it refuses to
     open a workbook that breaks them and an assignment title is teacher-typed
     text that can contain any of these. */
  function safeSheetName(name, index) {
    var clean = String(name || '').replace(/[\\\/\?\*\[\]:]/g, ' ').trim();
    if (!clean) clean = 'Sheet ' + (index + 1);
    return clean.slice(0, 31);
  }

  /* --------------------------------------------------------- the package */

  function build(sheets) {
    var list = (sheets || []).filter(Boolean);
    if (!list.length) list = [{ name: 'Sheet 1', rows: [] }];

    var names = [];
    list.forEach(function (sheet, i) {
      var name = safeSheetName(sheet.name, i);
      // Excel also refuses two sheets with the same name, and two assignments
      // can share a title.
      var candidate = name;
      var n = 2;
      while (names.indexOf(candidate.toLowerCase()) !== -1) {
        candidate = name.slice(0, 28) + ' ' + n;
        n += 1;
      }
      names.push(candidate.toLowerCase());
      sheet.__name = candidate;
    });

    var types = HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    list.forEach(function (_, i) {
      types += '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
        '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    });
    types += '</Types>';

    var rootRels = HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';

    var workbook = HEAD +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
    list.forEach(function (sheet, i) {
      workbook += '<sheet name="' + xmlAttr(sheet.__name) + '" sheetId="' + (i + 1) +
        '" r:id="rId' + (i + 1) + '"/>';
    });
    workbook += '</sheets></workbook>';

    var wbRels = HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    list.forEach(function (_, i) {
      wbRels += '<Relationship Id="rId' + (i + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"' +
        ' Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    });
    wbRels += '<Relationship Id="rId' + (list.length + 1) +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"' +
      ' Target="styles.xml"/></Relationships>';

    var files = [
      { name: '[Content_Types].xml', bytes: utf8(types) },
      { name: '_rels/.rels', bytes: utf8(rootRels) },
      { name: 'xl/workbook.xml', bytes: utf8(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', bytes: utf8(wbRels) },
      { name: 'xl/styles.xml', bytes: utf8(stylesXml()) }
    ];
    list.forEach(function (sheet, i) {
      files.push({
        name: 'xl/worksheets/sheet' + (i + 1) + '.xml',
        bytes: utf8(sheetXml(sheet))
      });
    });

    return zip(files);
  }

  window.PyPathXlsx = {
    STYLE: STYLE,
    build: build,
    // Exported for the tests, which assert on the escaping rather than
    // discovering it when a student called Ampersand & Co breaks a workbook.
    xmlText: xmlText,
    colName: colName,
    crc32: crc32,
    safeSheetName: safeSheetName,
    MIME: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
})();
