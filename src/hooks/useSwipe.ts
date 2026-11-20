import { useEffect, useRef } from "react";

/** Horizontal travel, in wheel-delta pixels, that turns one page. */
const THRESHOLD = 90;
/** Quiet time that ends a gesture, including the trackpad's inertia tail. */
const IDLE_MS = 260;

/** True when the event started somewhere that handles horizontal input itself. */
function ownsHorizontal(target: EventTarget | null) {
  for (let el = target as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
    if (el.matches("input, select, textarea, [data-no-swipe]")) return true;
    const overflow = getComputedStyle(el).overflowX;
    if ((overflow === "auto" || overflow === "scroll") && el.scrollWidth > el.clientWidth)
      return true;
  }
  return false;
}

/**
 * Two-finger trackpad swipes (and touch swipes) step through pages:
 * moving the fingers right calls `step(1)`, moving them left `step(-1)`.
 * One gesture turns at most one page, however long its inertia lasts.
 */
export function useSwipe(step: (direction: 1 | -1) => void) {
  const latest = useRef(step);
  useEffect(() => {
    latest.current = step;
  });

  useEffect(() => {
    let x = 0,
      y = 0,
      fired = false,
      idle: number | undefined;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || ownsHorizontal(e.target)) return;
      x += e.deltaX;
      y += e.deltaY;
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        x = y = 0;
        fired = false;
      }, IDLE_MS);
      if (fired || Math.abs(x) < THRESHOLD || Math.abs(x) < Math.abs(y) * 2) return;
      fired = true;
      // With natural scrolling, fingers moving right report a negative deltaX.
      latest.current(x < 0 ? 1 : -1);
    };

    let start: { x: number; y: number } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start =
        e.touches.length === 1 && !ownsHorizontal(e.target) ? { x: t.clientX, y: t.clientY } : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!start || !t) return;
      const dx = t.clientX - start.x,
        dy = t.clientY - start.y;
      start = null;
      if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 2) latest.current(dx > 0 ? 1 : -1);
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.clearTimeout(idle);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);
}
