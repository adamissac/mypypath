/* PyPath — pure rules for provider sign-in. No Firebase, no DOM, so the
   decision that guards account creation can be tested directly. */

// Signing in must never be a back door to signing up. Firebase creates the
// account during the popup, so the caller has to detect a brand-new user and
// undo it; this decides when that applies.
export function shouldRejectNewUser(additionalUserInfo, options) {
  const allowNewAccount = !!(options && options.allowNewAccount);
  if (allowNewAccount) return false;
  return !!(additionalUserInfo && additionalUserInfo.isNewUser === true);
}
