/**
 * Viewport transformation utilities for canvas zoom and pan operations
 */

export interface ViewportTransform {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
}

export const createIdentityTransform = (): ViewportTransform => ({
  scaleX: 1,
  scaleY: 1,
  translateX: 0,
  translateY: 0,
});

export const applyTransform = (
  ctx: CanvasRenderingContext2D,
  transform: ViewportTransform,
): void => {
  ctx.transform(
    transform.scaleX,
    0,
    0,
    transform.scaleY,
    transform.translateX,
    transform.translateY,
  );
};

export const screenToWorld = (
  screenX: number,
  screenY: number,
  transform: ViewportTransform,
): { x: number; y: number } => {
  return {
    x: (screenX - transform.translateX) / transform.scaleX,
    y: (screenY - transform.translateY) / transform.scaleY,
  };
};

export const worldToScreen = (
  worldX: number,
  worldY: number,
  transform: ViewportTransform,
): { x: number; y: number } => {
  return {
    x: worldX * transform.scaleX + transform.translateX,
    y: worldY * transform.scaleY + transform.translateY,
  };
};

export const clampZoom = (scale: number, min = 0.1, max = 10): number => {
  return Math.max(min, Math.min(max, scale));
};

export const clampTranslation = (
  translate: number,
  scale: number,
  viewportSize: number,
  contentSize: number,
): number => {
  const maxTranslate = 0;
  const minTranslate = viewportSize - contentSize * scale;
  return Math.max(minTranslate, Math.min(maxTranslate, translate));
};
