/* The entrance, as numbers between 0 and 1 the scene turns into motion.
 *
 * full: the island rises through the clouds, the clouds part, the trail lights
 *       from the cabin to the summit and the hiker walks to their stop.
 * late: the scene arrived after the still image was already showing, so it
 *       takes over at rest and only lights the trail.
 * none: already seen this session. */
export function entrancePlan({ readyAt, heroVisible, seen }) {
  if (seen) return 'none';
  return readyAt <= 2500 && heroVisible ? 'full' : 'late';
}

const span = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

export function entranceAt(t, plan) {
  if (plan === 'full') {
    return {
      rise: span(t, 0, 1.2),
      clouds: span(t, 0.6, 1.8),
      trail: span(t, 1.2, 2.7),
      hiker: span(t, 2.2, 3.5),
      done: t >= 3.5,
    };
  }
  if (plan === 'late') {
    return { rise: 1, clouds: 1, trail: span(t, 0, 1.5), hiker: span(t, 1.0, 2.3), done: t >= 2.3 };
  }
  return { rise: 1, clouds: 1, trail: 1, hiker: 1, done: true };
}
