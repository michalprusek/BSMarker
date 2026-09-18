import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const SHOW_DELAY_MS = 350;
const GAP_PX = 6;
const MARGIN_PX = 8;

export interface TipContent {
  /** What the control is. */
  title: string;
  /** What clicking it does now (may depend on its current state). */
  body?: React.ReactNode;
  /** Keyboard shortcut, e.g. "Space". */
  keys?: string;
}

/**
 * Hover explanation for a control: name, what a click does, shortcut.
 * Replaces the slow native `title` tooltip; rendered in a portal so panels
 * with overflow don't clip it, and kept inside the window.
 */
export const Tip: React.FC<
  TipContent & { children: React.ReactNode; className?: string }
> = ({ title, body, keys, children, className }) => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<number>();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setAnchor(null);
  }, []);
  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (anchorRef.current)
        setAnchor(anchorRef.current.getBoundingClientRect());
    }, SHOW_DELAY_MS);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <span
      ref={anchorRef}
      className={className ?? "inline-flex"}
      onMouseEnter={show}
      onMouseLeave={hide}
      onPointerDown={hide}
    >
      {children}
      {anchor &&
        createPortal(
          <TipBubble anchor={anchor} title={title} body={body} keys={keys} />,
          document.body,
        )}
    </span>
  );
};

const TipBubble: React.FC<TipContent & { anchor: DOMRect }> = ({
  anchor,
  title,
  body,
  keys,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Below the control, flipped above near the bottom edge, clamped horizontally.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const centre = anchor.left + anchor.width / 2;
    const left = Math.min(
      Math.max(MARGIN_PX, centre - width / 2),
      window.innerWidth - width - MARGIN_PX,
    );
    const below = anchor.bottom + GAP_PX;
    const top =
      below + height > window.innerHeight - MARGIN_PX
        ? anchor.top - GAP_PX - height
        : below;
    setPos({ left, top });
  }, [anchor]);

  return (
    <div
      ref={ref}
      role="tooltip"
      className="fixed z-50 max-w-[18rem] rounded-md bg-gray-900/95 text-white shadow-lg px-2.5 py-1.5 text-xs leading-snug pointer-events-none"
      style={pos ?? { left: -9999, top: -9999 }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{title}</span>
        {keys && (
          <kbd className="font-sans text-[10px] text-gray-300 border border-gray-600 rounded px-1">
            {keys}
          </kbd>
        )}
      </div>
      {body && <div className="text-gray-300 mt-0.5">{body}</div>}
    </div>
  );
};
