/* Pointer input for the summit: drag to spin, lean toward the cursor, hover a
   stop for its label, click a stop to open its unit, click the flag for
   fireworks. Touch keeps vertical scrolling (touch-action: pan-y on the
   canvas), so only sideways swipes turn the island. */
import { Raycaster, Vector2, Vector3 } from 'three';

const CLICK_SLOP = 6; // px a press may move and still count as a click

export function createInteraction({ host, canvas, camera, spin, targets, onHover, onStop, onFlag }) {
  const ray = new Raycaster();
  const ndc = new Vector2();
  const lean = { x: 0, y: 0, tx: 0, ty: 0 };
  let down = null;
  let lastMove = 0;
  let hovered = null;
  let pointerInside = false;

  canvas.style.touchAction = 'pan-y';
  canvas.style.cursor = 'grab';

  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(targets(), false)[0];
    return hit ? hit.object.userData.target : null;
  }

  function setHover(target) {
    if (target === hovered) return;
    hovered = target;
    canvas.style.cursor = down && down.dragging ? 'grabbing' : target ? 'pointer' : 'grab';
    onHover(target);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false, target: pick(e), type: e.pointerType };
    lastMove = performance.now();
    spin.grab(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    pointerInside = true;
    if (down && e.pointerId === down.id) {
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (!down.dragging && Math.hypot(dx, dy) > CLICK_SLOP) {
        // On touch, a mostly vertical swipe is the page scrolling: let it go.
        if (down.type !== 'mouse' && Math.abs(dy) > Math.abs(dx)) {
          spin.release();
          down = null;
          return;
        }
        down.dragging = true;
        canvas.style.cursor = 'grabbing';
        setHover(null);
      }
      if (down.dragging) {
        const now = performance.now();
        spin.drag(e.clientX, down.type === 'mouse' ? e.clientY : down.y, Math.max((now - lastMove) / 1000, 1 / 240));
        lastMove = now;
      }
      return;
    }
    if (e.pointerType === 'mouse') setHover(pick(e));
  });

  function end(e) {
    if (!down || e.pointerId !== down.id) return;
    const wasDrag = down.dragging;
    const target = down.target;
    spin.release();
    down = null;
    canvas.style.cursor = hovered ? 'pointer' : 'grab';
    if (wasDrag || e.type === 'pointercancel') return;
    const now = pick(e);
    if (!now || now !== target) return;
    if (now.kind === 'stop') onStop(now);
    else if (now.kind === 'flag') onFlag(now);
  }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => {
    pointerInside = false;
    if (!down) setHover(null);
  });

  // Lean toward the cursor anywhere over the hero, not only over the canvas.
  const zone = host.closest('.home-hero') || host;
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    lean.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    lean.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
  });
  zone.addEventListener('pointerleave', () => { lean.tx = 0; lean.ty = 0; });

  const LEAN = 0.07; // about 4 degrees
  return {
    step(dt) {
      const k = 1 - Math.exp(-dt * 4);
      lean.x += (lean.tx - lean.x) * k;
      lean.y += (lean.ty - lean.y) * k;
      return { yaw: lean.x * LEAN, pitch: lean.y * LEAN * 0.7 };
    },
    get hovered() { return hovered; },
    get pointerInside() { return pointerInside; },
  };
}

/* Screen position (CSS px inside the canvas) of a world point. */
const tmp = new Vector3();
export function toScreen(object, offsetY, camera, canvas) {
  object.getWorldPosition(tmp);
  tmp.y += offsetY;
  tmp.project(camera);
  return {
    x: (tmp.x * 0.5 + 0.5) * canvas.clientWidth,
    y: (-tmp.y * 0.5 + 0.5) * canvas.clientHeight,
    visible: tmp.z < 1,
  };
}
