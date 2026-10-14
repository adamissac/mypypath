/* Drag-to-spin with inertia. Pure: the caller feeds pointer positions and
 * frame times; this returns the island's yaw and tilt in radians. */
const SENSITIVITY = 0.01; // radians per CSS pixel
const MAX_FLING = 6; // rad/s, so a wild flick still reads as a spin

export function createSpin({
  friction = 4,
  maxTilt = 0.14,
  idleSpeed = (Math.PI * 2) / 52,
  resumeAfter = 3,
} = {}) {
  let yaw = 0;
  let tilt = 0;
  let velocity = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let idle = Infinity; // never touched: turn on our own from the start
  const clampTilt = (t) => Math.max(-maxTilt, Math.min(maxTilt, t));

  return {
    grab(x, y) {
      dragging = true;
      velocity = 0;
      lastX = x;
      lastY = y;
    },
    drag(x, y, dt) {
      if (!dragging) return;
      const dYaw = (x - lastX) * SENSITIVITY;
      yaw += dYaw;
      tilt = clampTilt(tilt + (y - lastY) * SENSITIVITY * 0.5);
      if (dt > 0) {
        const v = Math.max(-MAX_FLING, Math.min(MAX_FLING, dYaw / dt));
        velocity = velocity * 0.3 + v * 0.7;
      }
      lastX = x;
      lastY = y;
    },
    release() {
      dragging = false;
      idle = 0;
    },
    step(dt) {
      if (!dragging) {
        yaw += velocity * dt;
        velocity *= Math.exp(-friction * dt);
        if (Math.abs(velocity) < 1e-5) velocity = 0;
        idle += dt;
        if (idle >= resumeAfter) {
          yaw += idleSpeed * dt;
          tilt *= Math.exp(-1.5 * dt);
        }
      }
      return { yaw, tilt };
    },
    get dragging() {
      return dragging;
    },
  };
}
