/* Who gets the 3D scene. Everyone else keeps the still image, which is a
 * complete picture of the same island. Mirrored in assets/js/summit-3d.js,
 * which cannot import a module; tests/summit-bootstrap.test.js holds the two
 * together. */
export function qualifies({ reduced, saveData, effectiveType, webgl, isHome, course }) {
  if (!isHome || reduced || !webgl || course === 'data') return false;
  if (saveData) return false;
  return !['slow-2g', '2g', '3g'].includes(effectiveType);
}
