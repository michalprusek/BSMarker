import { RefObject, useEffect, useRef } from "react";

/**
 * Close a popup on a press outside it or on Escape.
 *
 * Listens in the capture phase: the spectrogram calls preventDefault on
 * pointerdown (so no focus change / blur / mousedown happens there), and a
 * capture listener on the document still runs before it. `ignore` lists
 * elements that toggle the popup themselves (e.g. its toolbar button), so a
 * press on them doesn't close and immediately reopen it.
 */
export function useDismiss(
  ref: RefObject<HTMLElement>,
  onDismiss: () => void,
  ignore: RefObject<HTMLElement>[] = [],
): void {
  const latest = useRef({ onDismiss, ignore });
  latest.current = { onDismiss, ignore };

  useEffect(() => {
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      [ref, ...latest.current.ignore].some((r) => r.current?.contains(target));

    const onPointerDown = (e: PointerEvent) => {
      if (!inside(e.target)) latest.current.onDismiss();
    };
    // Escape closes the popup only — it must not also deselect boxes or stop playback.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      latest.current.onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [ref]);
}
