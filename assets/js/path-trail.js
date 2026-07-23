/**
 * PyPath trail map — scroll progress drives stroke-dashoffset + unit light-up.
 * Positions stop markers on the path by arc length so they stay on the trail.
 */
(function () {
  const section = document.querySelector("[data-path-journey]");
  if (!section) return;

  const track = section.querySelector(".path-journey__track");
  const drawPath = section.querySelector(".path-map__draw");
  const head = section.querySelector(".path-head");
  const stops = Array.from(section.querySelectorAll("[data-stop]"));
  const cards = Array.from(section.querySelectorAll("[data-stop-card]"));
  const reduced =
    document.documentElement.classList.contains("reduced-motion") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const STOP_COUNT = stops.length || 10;
  /** Fraction along the path (0–1) where each stop sits */
  const stopAt = [];

  function placeStopsOnPath() {
    if (!drawPath || typeof drawPath.getTotalLength !== "function") return;
    let len = 0;
    try {
      len = drawPath.getTotalLength();
    } catch (_) {
      return;
    }
    if (!len) return;

    for (let i = 0; i < STOP_COUNT; i++) {
      const t = STOP_COUNT === 1 ? 0 : i / (STOP_COUNT - 1);
      stopAt[i] = t;
      const pt = drawPath.getPointAtLength(t * len);
      const stop = stops[i];
      if (!stop) continue;

      const dot = stop.querySelector(".path-stop-dot");
      const num = stop.querySelector(".path-stop-num");
      const label = stop.querySelector(".path-stop-label");

      if (dot) {
        dot.setAttribute("cx", String(pt.x));
        dot.setAttribute("cy", String(pt.y));
      }
      if (num) {
        num.setAttribute("x", String(pt.x));
        num.setAttribute("y", String(pt.y));
      }
      if (label) {
        const side = i % 2 === 0 ? 1 : -1;
        const lx = pt.x + side * 22;
        const ly = pt.y + (i % 3 === 1 ? 22 : -18);
        label.setAttribute("x", String(lx));
        label.setAttribute("y", String(ly));
        if (side < 0) label.setAttribute("text-anchor", "end");
        else label.removeAttribute("text-anchor");
      }
    }
  }

  function setProgress(p) {
    const progress = Math.min(1, Math.max(0, p));
    section.style.setProperty("--path-progress", String(progress));

    let activeIndex = 0;
    for (let i = 0; i < STOP_COUNT; i++) {
      const threshold =
        stopAt[i] != null
          ? stopAt[i]
          : STOP_COUNT === 1
            ? 0
            : i / (STOP_COUNT - 1);
      const lit = progress >= Math.max(0, threshold - 0.012);
      const stop = stops[i];
      if (stop) {
        stop.classList.toggle("is-lit", lit);
        const dot = stop.querySelector(".path-stop-dot");
        if (dot) dot.classList.toggle("is-lit", lit);
      }
      if (lit) activeIndex = i;
    }

    cards.forEach((card, i) => {
      card.classList.toggle("is-active", i === activeIndex);
    });

    if (head && drawPath && typeof drawPath.getTotalLength === "function") {
      try {
        const len = drawPath.getTotalLength();
        const pt = drawPath.getPointAtLength(progress * len);
        head.setAttribute("transform", `translate(${pt.x}, ${pt.y})`);
      } catch (_) {
        /* path not ready */
      }
    }
  }

  function measure() {
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const total = track.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    const scrolled = Math.min(Math.max(-rect.top, 0), total);
    return scrolled / total;
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const p = measure();
      setProgress(p);
      section.classList.toggle("is-active", p > 0.008 && p < 0.995);
    });
  }

  placeStopsOnPath();

  if (reduced) {
    setProgress(1);
    section.classList.add("is-active");
    stops.forEach((s) => {
      s.classList.add("is-lit");
      const dot = s.querySelector(".path-stop-dot");
      if (dot) dot.classList.add("is-lit");
    });
    if (cards.length) {
      cards.forEach((c) => c.classList.remove("is-active"));
      cards[cards.length - 1].classList.add("is-active");
    }
    return;
  }

  setProgress(0);

  // Listen on window + body: legacy site CSS sometimes makes body the scrollport
  window.addEventListener("scroll", onScroll, { passive: true });
  document.body.addEventListener("scroll", onScroll, { passive: true });
  document.documentElement.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener(
    "resize",
    () => {
      placeStopsOnPath();
      onScroll();
    },
    { passive: true }
  );
  onScroll();
})();
