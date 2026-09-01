/* PyPath — CSV export and the weekly digest.
 *
 * Both are plain strings built here and handed to the browser, with no
 * third-party library: a CSV writer is thirty lines and a dependency is
 * forever.
 *
 * Pure functions, so the escaping rules can be tested rather than discovered
 * when a student called O'Brien breaks a teacher's spreadsheet.
 */
(function () {
  'use strict';

  var CORE = window.PyPathClassroom;

  /* RFC 4180. A field is quoted when it contains a comma, a quote, or a line
     break, and an embedded quote is doubled.

     The leading apostrophe guard is not paranoia: Excel and Sheets treat a
     field starting with =, +, - or @ as a formula, so an innocuous cell can
     become code that runs when a teacher opens the file. Usernames are
     user-controlled text, which is exactly the input that matters here. */
  function csvField(value) {
    var text = value == null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function csvRow(cells) {
    return (cells || []).map(csvField).join(',');
  }

  /* CRLF line endings, because that is what RFC 4180 says and what Excel
     expects. */
  function toCsv(rows) {
    return (rows || []).map(csvRow).join('\r\n') + '\r\n';
  }

  function isoDay(ms) {
    if (!ms) return '';
    return new Date(ms).toISOString().slice(0, 10);
  }

  /* The same words the dashboard uses, so a teacher comparing the sheet with
     the screen is reading one vocabulary rather than two. */
  var ASSIGN_LABEL = {
    'done-on-time': 'On time',
    'done-late': 'Late',
    'not-due': 'Not due yet',
    overdue: 'Overdue',
    expired: 'Records expired'
  };

  /* ------------------------------------------------------------ the grid */

  /* The grid, as rows.
   *
   * Split out from masteryCsv so the .xlsx export builds its Grid sheet from
   * exactly these rows rather than deriving the same figures a second time.
   * Two exports of one class that disagreed about a mark would be worse than
   * having only one, and the way that happens is two code paths asking
   * classroom-core.js the same question slightly differently. */
  function masteryRows(students, options) {
    var opts = options || {};
    var lessonsByUnit = opts.lessonsByUnit || {};
    var totalUnits = opts.totalUnits || 10;
    var rows = [];

    var assignments = opts.assignments || [];
    var statusOpts = {
      now: opts.now || Date.now(),
      lessonsByUnit: lessonsByUnit,
      lessonTitles: opts.lessonTitles || {}
    };

    var header = ['Student', 'Percent complete', 'Units verified', 'Last active'];
    for (var u = 1; u <= totalUnits; u += 1) header.push('Unit ' + u);
    // One column per assignment, after the units, so the sheet reads as
    // "where they are" and then "what was asked".
    assignments.forEach(function (a) { header.push(a.title); });
    /* Carried over from the legacy roster export when its table was removed.
       A teacher who exported that sheet for their records must not lose the
       column just because the page it came from is gone. */
    header.push('Certificate', 'Certificate requested', 'Certificate decided');
    rows.push(header);

    (students || []).forEach(function (student) {
      var figures = CORE.studentHeader(student, lessonsByUnit);
      var row = [
        figures.displayName,
        figures.percentComplete,
        figures.unitsVerified,
        isoDay(figures.lastActiveAt)
      ];
      for (var unit = 1; unit <= totalUnits; unit += 1) {
        // The word, not the mark: a spreadsheet is not the place for a glyph
        // whose key lives on a different page.
        row.push(CORE.MASTERY_LABEL[
          CORE.unitState(student.events, lessonsByUnit[unit] || [], unit)
        ]);
      }
      assignments.forEach(function (a) {
        var status = CORE.assignmentStatus(a, student.events, statusOpts);
        // The word and the day count, not a colour and not a mark: a
        // spreadsheet outlives the page whose key would explain either.
        row.push(ASSIGN_LABEL[status.state]
          + (status.state === 'done-late' ? ' by ' + status.daysLate + 'd' : ''));
      });

      var cert = student.certificate || {};
      // The word, for the same reason every other cell here carries one.
      row.push(CORE.CERT_CSV[CORE.certificateState(cert)]);
      row.push(isoDay(cert.requestedAt || 0));
      row.push(isoDay(cert.decidedAt || 0));
      rows.push(row);
    });

    return rows;
  }

  function masteryCsv(students, options) {
    return toCsv(masteryRows(students, options));
  }

  /* --------------------------------------------------------- one student */

  function studentCsv(student, options) {
    var opts = options || {};
    var lessons = opts.lessons || [];
    var rows = [];

    rows.push(['Student', student.displayName || student.uid]);
    rows.push(['Exported', isoDay(Date.now())]);
    // Stated in the file itself, because a CSV outlives the page it came from
    // and will be read by someone who never saw the dashboard's caveats.
    rows.push(['Note', 'Activity recorded by each student\'s own browser. Not a grade.']);
    rows.push([]);
    rows.push(['Lesson', 'Unit', 'State', 'Attempts', 'First try', 'Last activity']);

    CORE.perLessonRows(student.events, lessons).forEach(function (row) {
      rows.push([
        row.title,
        row.unit,
        CORE.MASTERY_LABEL[row.state],
        row.attempts,
        row.firstTryRate === null ? '' : Math.round(row.firstTryRate * 100) + '%',
        isoDay(row.lastActivity)
      ]);
    });

    return toCsv(rows);
  }

  /* ---------------------------------------------------------- workbook */

  /* The same class as a real .xlsx, in three sheets.
   *
   * What this buys over the CSV that already exists, which is the whole
   * justification for it: three tables in one file instead of three downloads,
   * a header row that stays put while a class of forty scrolls under it,
   * columns wide enough to read, and a shaded cell where a teacher is scanning
   * for gaps. None of that is expressible in CSV, and all of it is what a
   * teacher meant by "export to Excel".
   *
   * Every figure comes from the row builders above, which is the point: the
   * .xlsx and the .csv are two renderings of one set of rows, so they cannot
   * come to different conclusions about the same student.
   */

  // Shading marks the states that are gaps, and it is redundant on purpose:
  // the word is in the cell either way. A teacher printing this in greyscale,
  // or reading it colourblind, loses nothing but the scanning aid -- the same
  // rule MASTERY_MARK follows on screen.
  var GAP_STATES = { 'not-opened': true, 'in-progress': true };

  function markStyle(label) {
    var X = window.PyPathXlsx;
    if (!X) return 0;
    var gap = Object.keys(GAP_STATES).some(function (key) {
      return CORE.MASTERY_LABEL[key] === label;
    });
    return gap ? X.STYLE.mark : 0;
  }

  /* One row per assignment rather than one column: the grid sheet already has
     the per-student view, and a teacher looking at this sheet is asking "how
     did that piece of work go", which is a question about the class. */
  function assignmentRows(students, options) {
    var opts = options || {};
    var assignments = opts.assignments || [];
    var statusOpts = {
      now: opts.now || Date.now(),
      lessonsByUnit: opts.lessonsByUnit || {},
      lessonTitles: opts.lessonTitles || {}
    };
    var rows = [[
      'Assignment', 'Units', 'Lessons', 'Due', 'On time', 'Late', 'Not done', 'Records expired'
    ]];

    assignments.forEach(function (a) {
      var tally = { 'done-on-time': 0, 'done-late': 0, 'not-due': 0, overdue: 0, expired: 0 };
      (students || []).forEach(function (student) {
        var state = CORE.assignmentStatus(a, student.events, statusOpts).state;
        if (tally[state] !== undefined) tally[state] += 1;
      });
      rows.push([
        a.title,
        (a.units || []).join(', '),
        (a.lessonPaths || []).length,
        isoDay(CORE.toMillis(a.dueAt)),
        tally['done-on-time'],
        tally['done-late'],
        // "Not done" is the honest merge of not-due and overdue: both mean the
        // work is outstanding, and the due date column already says which.
        tally['not-due'] + tally.overdue,
        tally.expired
      ]);
    });

    return rows;
  }

  /* The roster sheet: who is in the class and where their certificate stands.
     Deliberately narrow -- this is the sheet a teacher prints for a meeting,
     and the per-unit detail is one tab away. */
  function rosterRows(students, options) {
    var opts = options || {};
    var lessonsByUnit = opts.lessonsByUnit || {};
    var rows = [[
      'Student', 'Percent complete', 'Units verified', 'Last active',
      'Certificate', 'Requested', 'Decided'
    ]];

    (students || []).forEach(function (student) {
      var figures = CORE.studentHeader(student, lessonsByUnit);
      var cert = student.certificate || {};
      rows.push([
        figures.displayName,
        figures.percentComplete,
        figures.unitsVerified,
        isoDay(figures.lastActiveAt),
        CORE.CERT_CSV[CORE.certificateState(cert)],
        isoDay(cert.requestedAt || 0),
        isoDay(cert.decidedAt || 0)
      ]);
    });

    return rows;
  }

  /* Column widths, in Excel's character units.
   *
   * Guessed from the content rather than measured, because measuring text
   * needs a canvas and this is a spreadsheet, not typesetting. The first
   * column is names and gets the most room; the rest are capped so one long
   * assignment title cannot push the units off the screen. */
  function widthsFor(rows) {
    var widths = [];
    (rows || []).forEach(function (row) {
      (row || []).forEach(function (cell, i) {
        var value = cell && typeof cell === 'object' ? cell.v : cell;
        var len = String(value == null ? '' : value).length;
        widths[i] = Math.max(widths[i] || 8, Math.min(len + 3, i === 0 ? 32 : 22));
      });
    });
    return widths;
  }

  function masteryWorkbook(students, options) {
    var X = window.PyPathXlsx;
    if (!X) throw new Error('xlsx-writer.js is not loaded');

    var grid = masteryRows(students, options);
    // The unit columns start after Student / Percent / Units verified / Last
    // active, and run for totalUnits. Only those get the gap shading; a
    // shaded assignment or certificate cell would mean something different.
    var firstUnit = 4;
    var lastUnit = firstUnit + ((options && options.totalUnits) || 10) - 1;
    var styled = grid.map(function (row, r) {
      if (r === 0) return row;
      return row.map(function (cell, c) {
        if (c < firstUnit || c > lastUnit) return cell;
        var style = markStyle(cell);
        return style ? { v: cell, s: style } : cell;
      });
    });

    var assignments = assignmentRows(students, options);
    var roster = rosterRows(students, options);

    return X.build([
      { name: 'Mastery grid', rows: styled, widths: widthsFor(grid) },
      { name: 'Assignments', rows: assignments, widths: widthsFor(assignments) },
      { name: 'Roster', rows: roster, widths: widthsFor(roster) }
    ]);
  }

  /* ------------------------------------------------------------- digest */

  /* A copyable block of this week's needs-attention list. Teacher-triggered,
     never scheduled: sending mail on a timer needs a server this project does
     not have, and pretending otherwise would mean a digest that silently
     never arrives. */
  function digest(students, options) {
    var opts = options || {};
    var now = opts.now || Date.now();
    var rows = CORE.needsAttention(students, opts);
    var summary = CORE.classSummary(students, opts);
    var lines = [];

    lines.push((opts.className || 'Class') + ' — week to ' + isoDay(now));
    lines.push('');
    lines.push(summary.students + ' students, ' + summary.activeThisWeek + ' active this week.');
    if (summary.medianUnitReached) {
      lines.push('Median unit reached: ' + summary.medianUnitReached + '.');
    }
    if (summary.hardestLesson) {
      lines.push('Hardest lesson: ' + summary.hardestLesson.title
        + ' (' + summary.hardestLesson.averageAttempts + ' attempts on average).');
    }
    if (summary.commonError) {
      lines.push('Most common error: ' + summary.commonError.errorType
        + ' (' + summary.commonError.count + ' times).');
    }
    lines.push('');

    if (!rows.length) {
      lines.push('Nothing flagged this week.');
    } else {
      lines.push('Worth a conversation:');
      rows.forEach(function (row) {
        lines.push('- ' + row.displayName + ': ' + row.reason + '. ' + row.nextStep + '.');
      });
    }

    lines.push('');
    lines.push('These are actions the site recorded, not grades. A student can be');
    lines.push('doing fine and appear here, or be stuck and not appear at all.');

    return lines.join('\n');
  }

  /* Hands the browser a file. A data: or blob: link is used rather than any
     upload: the export never leaves the teacher's machine. */
  function download(filename, text, mime) {
    // A string gets a charset; bytes must not, because ";charset=utf-8" on a
    // zip is a lie and some browsers act on it.
    var type = typeof text === 'string'
      ? (mime || 'text/csv') + ';charset=utf-8'
      : (mime || 'application/octet-stream');
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.PyPathExport = {
    csvField: csvField,
    csvRow: csvRow,
    toCsv: toCsv,
    masteryRows: masteryRows,
    masteryCsv: masteryCsv,
    assignmentRows: assignmentRows,
    rosterRows: rosterRows,
    widthsFor: widthsFor,
    masteryWorkbook: masteryWorkbook,
    studentCsv: studentCsv,
    digest: digest,
    download: download
  };
})();
