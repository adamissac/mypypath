/* PyPath — the version stamped on every document this site writes.
 *
 * Stored on each document so a later reader can tell which shape it is looking
 * at. Without it a migration has to guess from which fields happen to be
 * present, which stops working the moment two changes overlap.
 *
 * Bump this when the shape of a written document changes in a way a reader
 * cannot infer, and leave a note here saying what changed.
 *
 *   1 — initial: classes, joinCodes, roster, progress mirror, events.
 */
(function () {
  'use strict';

  var SCHEMA_VERSION = 1;

  window.PyPathSchema = {
    SCHEMA_VERSION: SCHEMA_VERSION,

    // Convenience for writers: stamp(obj) returns obj with the version set, so
    // a caller cannot forget the field or spell it differently.
    stamp: function (data) {
      var out = {};
      var key;
      for (key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) out[key] = data[key];
      }
      out.schemaVersion = SCHEMA_VERSION;
      return out;
    }
  };
})();
