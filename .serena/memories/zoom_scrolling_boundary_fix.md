# Zoom and Scrolling Invisible Boundary Fix

## Problem Description
When zooming in the spectrogram and scrolling to the right, users encounter an invisible boundary that prevents scrolling and annotation beyond a certain point. The boundary appears around 75-80% of the zoomed content width.

## Root Cause
Width calculation mismatch between the scroll container and the Konva Stage:
- **Container width (incorrect)**: `spectrogramDimensions.width * zoomLevel`
- **Stage width (correct)**: `(spectrogramDimensions.width - FREQUENCY_SCALE_WIDTH) * zoomLevel`
- **Difference**: 40px * zoomLevel creating a "dead zone"

The frequency scale (40px) should remain at fixed width while only the content area zooms.

## Solution
Fixed the container width calculation in AnnotationEditor.tsx line 2238:

### Before:
```typescript
width: `${spectrogramDimensions.width * zoomLevel}px`
```

### After:
```typescript
width: `${(spectrogramDimensions.width - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH) * zoomLevel + LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH}px`
```

This formula:
1. Zooms only the content area: `(width - 40) * zoom`
2. Adds back the fixed frequency scale: `+ 40`
3. Ensures container matches Stage + frequency scale width exactly

## Files Modified
- `/frontend/src/pages/AnnotationEditor.tsx` (line 2238)

## Related Components
- Stage width calculation (line 2510)
- Image width calculation (line 2266)
- Frequency scale constant in `/frontend/src/utils/coordinates.ts`

## Testing Checklist
- ✓ TypeScript compilation passes
- ✓ Can scroll to full extent when zoomed
- ✓ Can annotate at any position when zoomed
- ✓ Frequency scale remains fixed width
- ✓ No visual artifacts or misalignment

## Debug Data Reference
When the bug was active, debug logs showed:
- worldX (868) < absoluteX (1162) - indicating transformation issue
- effectiveWidth: 706px (correct content width)
- stageWidth: 945px (zoomed content)
- Container was ~53px wider than Stage creating the dead zone
