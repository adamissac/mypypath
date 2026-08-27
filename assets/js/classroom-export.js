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

  function masteryCsv(students, options) {
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
      rows.push(row);
    });

    return toCsv(rows);
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
    var blob = new Blob([text], { type: (mime || 'text/csv') + ';charset=utf-8' });
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
    masteryCsv: masteryCsv,
    studentCsv: studentCsv,
    digest: digest,
    download: download
  };
})();
