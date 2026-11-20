import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

interface Props {
  current: string;
  order: string[];
  onSelect: (id: string) => void;
  renderPage: (id: string) => ReactNode;
}

function ownsHorizontal(target: EventTarget | null, root: HTMLElement) {
  for (let el = target as Element | null; el && el !== root; el = el.parentElement) {
    if (el.matches("input, select, textarea, [data-no-swipe]")) return true;
    if (/^(auto|scroll)$/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth)
      return true;
  }
  return false;
}

export function SwipePager({ current, order, onSelect, renderPage }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const select = useRef(onSelect);
  const [preview, setPreview] = useState<{ id: string; direction: number } | null>(null);
  const at = order.indexOf(current);
  const next = at >= 0 ? order[at + 1] : undefined;
  const prev = at > 0 ? order[at - 1] : undefined;
  useLayoutEffect(() => {
    select.current = onSelect;
  });

  // Ignore momentum from the gesture that just committed, even across page changes.
  const lastWheel = useRef(-Infinity);
  const ignoreTail = useRef(false);
  useLayoutEffect(() => {
    const root = viewport.current!;
    const strip = track.current!;
    let dx = 0;
    let destination: string | undefined;
    let animation: Animation | undefined;
    let idle: number | undefined;
    let touch: Touch | undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function move(distance: number) {
      const direction = Math.sign(distance);
      const id = direction < 0 ? next : direction > 0 ? prev : undefined;
      if (id !== destination) {
        destination = id;
        setPreview(id ? { id, direction } : null);
      }
      dx = id ? direction * Math.min(Math.abs(distance), root.clientWidth) : 0;
      strip.style.transform = `translate3d(${reduced ? 0 : dx}px,0,0)`;
    }
    function settle(cancel = false) {
      if (animation || !destination) return;
      const width = root.clientWidth;
      const commit = !cancel && Math.abs(dx) >= Math.min(90, width * 0.22);
      const end = commit ? Math.sign(dx) * width : 0;
      const id = destination;
      animation = strip.animate(
        [
          { transform: strip.style.transform },
          { transform: `translate3d(${reduced ? 0 : end}px,0,0)` },
        ],
        {
          duration: reduced ? 0 : 160 + (130 * Math.abs(end - dx)) / width,
          easing: "cubic-bezier(.22,.75,.2,1)",
          fill: "forwards",
        },
      );
      animation.onfinish = () => {
        animation?.cancel();
        animation = undefined;
        strip.style.transform = "";
        dx = 0;
        destination = undefined;
        flushSync(() => {
          setPreview(null);
          if (commit) select.current(id);
        });
      };
    }
    function wheel(e: WheelEvent) {
      if (
        e.ctrlKey ||
        ownsHorizontal(e.target, root) ||
        Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.4 ||
        !e.deltaX
      )
        return;
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      if (now - lastWheel.current > 180) ignoreTail.current = false;
      lastWheel.current = now;
      if (animation || ignoreTail.current) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? root.clientWidth : 1;
      move(dx - e.deltaX * unit);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        ignoreTail.current = true;
        settle();
      }, 85);
    }
    function start(e: TouchEvent) {
      touch =
        e.touches.length === 1 && !animation && !ownsHorizontal(e.target, root)
          ? e.touches[0]
          : undefined;
      if (!touch && dx) settle(true);
    }
    function drag(e: TouchEvent) {
      if (!touch || animation) return;
      const x = e.touches[0].clientX - touch.clientX;
      const y = e.touches[0].clientY - touch.clientY;
      if (!dx && Math.abs(y) > Math.max(8, Math.abs(x))) {
        touch = undefined;
        return;
      }
      if (Math.abs(x) < 4 && !dx) return;
      if (e.cancelable) e.preventDefault();
      move(x);
    }
    function end(e: TouchEvent) {
      if (touch) settle(e.type === "touchcancel");
      touch = undefined;
    }
    if (next || prev) {
      root.addEventListener("wheel", wheel, { passive: false });
      root.addEventListener("touchstart", start, { passive: true });
      root.addEventListener("touchmove", drag, { passive: false });
      root.addEventListener("touchend", end);
      root.addEventListener("touchcancel", end);
    }
    return () => {
      window.clearTimeout(idle);
      animation?.cancel();
      strip.style.transform = "";
      setPreview(null);
      root.removeEventListener("wheel", wheel);
      root.removeEventListener("touchstart", start);
      root.removeEventListener("touchmove", drag);
      root.removeEventListener("touchend", end);
      root.removeEventListener("touchcancel", end);
    };
  }, [current, next, prev]);

  return (
    <div ref={viewport} className="swipe-viewport">
      <div ref={track} className="swipe-track">
        {[current, ...(preview && preview.id !== current ? [preview.id] : [])].map((id) => (
          <div
            key={id}
            className={id === current ? "swipe-page" : "swipe-preview"}
            inert={id !== current}
            style={id !== current ? { left: `${-100 * preview!.direction}%` } : undefined}
          >
            {renderPage(id)}
          </div>
        ))}
      </div>
    </div>
  );
}
