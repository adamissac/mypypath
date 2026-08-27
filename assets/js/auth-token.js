/* PyPath — handing a Firebase ID token to the one thing that needs one.
 *
 * api/grade.js verifies the caller server-side, which means something has to
 * fetch a token and pass it along. That is all this module does.
 *
 * It is its own file, and an ES module, because auth.js is an ES module and
 * lesson-progress.js is a classic global that cannot import one. The bridge is
 * a single function on window, put there by the module half, read by the
 * classic half, and absent for anyone signed out. Absent is a real answer:
 * PyPathAiGrade.grade returns a review without a token, which is the correct
 * behaviour for a guest rather than an error.
 */
import { currentUser } from '/assets/js/auth.js';

window.PyPathAuthToken = {
  /* Resolves to a token, or to null for a signed-out reader. Never throws:
     every caller of this is somewhere a thrown error would surface to a
     learner who did nothing wrong. */
  idToken: async function () {
    try {
      const user = currentUser();
      if (!user || typeof user.getIdToken !== 'function') return null;
      return await user.getIdToken();
    } catch (e) {
      return null;
    }
  }
};
