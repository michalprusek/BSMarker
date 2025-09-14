# Zoom Boundary Constraint Fix v2

## Problem Description
When zooming in the spectrogram and scrolling to the right, users encounter an area on the right side where bounding boxes and the timeline cursor cannot be moved. This "dead zone" occurs because boundary constraints were calculated using unzoomed dimensions while the actual Stage operates in zoomed space.

## Root Cause Analysis

### Primary Issue
The `constrainBoundingBox` function in `coordinates.ts` was not accounting for zoom level:
- **Constraint space**: Used raw `spectrogramDimensions.width` (unzoomed)
- **Actual Stage space**: Used `(spectrogramDimensions.width - 40) * zoomLevel` (zoomed)
- **Result**: Invisible boundary at `unzoomed_width` pixels, preventing access to the full zoomed area

### Contributing Factors
1. **SSOT Violations**: Width calculations duplicated throughout the codebase instead of being centralized
2. **Coordinate System Mismatch**: Mixed usage of zoomed and unzoomed coordinates in different functions
3. **Missing zoom parameter**: Constraint functions lacked zoom level awareness

## Solution Implementation

### 1. Updated constrainBoundingBox Function
Modified `/frontend/src/utils/coordinates.ts` to accept and apply zoom level:

```typescript
constrainBoundingBox(
  box: { x: number; y: number; width: number; height: number },
  totalWidth: number,
  totalHeight: number,
  accountForFrequencyScale: boolean = true,
  zoomLevel: number = 1  // NEW PARAMETER
): typeof box {
  // Apply zoom to content area only (frequency scale stays fixed)
  const effectiveWidth = accountForFrequencyScale
    ? (totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH) * zoomLevel
    : totalWidth * zoomLevel;
  
  const maxX = effectiveWidth;
  const maxY = totalHeight * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO * zoomLevel;
  
  // Constrain within zoomed boundaries
  // ... rest of constraint logic
}
```

### 2. Updated Function Calls
Modified `/frontend/src/pages/AnnotationEditor.tsx` line 977 to pass zoom level:

```typescript
const constrained = CoordinateUtils.constrainBoundingBox(
  box,
  spectrogramDimensions.width,
  spectrogramDimensions.height,
  true,      // Account for frequency scale
  zoomLevel  // Pass current zoom level
);
```

### 3. Added Helper Functions for SSOT
Added to `coordinates.ts` for consistent width calculations:

```typescript
// Calculate zoomed content width (Stage width)
getZoomedContentWidth(totalWidth: number, zoomLevel: number = 1): number {
  return (totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH) * zoomLevel;
}

// Calculate total container width (content + fixed frequency scale)
getZoomedContainerWidth(totalWidth: number, zoomLevel: number = 1): number {
  return this.getZoomedContentWidth(totalWidth, zoomLevel) + LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
}
```

## Files Modified
- `/frontend/src/utils/coordinates.ts` (lines 101-140)
- `/frontend/src/pages/AnnotationEditor.tsx` (line 977)

## Key Design Decisions

### Why Zoom Only Affects Content Area
The frequency scale (40px) should remain at fixed width for readability. Only the spectrogram content area should zoom, maintaining the formula:
- **Container width**: `(width - 40) * zoom + 40`
- **Stage width**: `(width - 40) * zoom`
- **Frequency scale**: Always `40px`

### Boundary Calculation Logic
When zoomed at 2x:
- Base width: 800px
- Content area: 760px (800 - 40)
- Zoomed content: 1520px (760 * 2)
- Container width: 1560px (1520 + 40)
- Boundary constraints must use 1520px, not 800px

## Testing Verification
- ✓ TypeScript compilation passes (`npm run typecheck`)
- ✓ Can move bounding boxes to full extent when zoomed
- ✓ Timeline cursor accessible across entire zoomed width
- ✓ No dead zones when scrolled to edges
- ✓ Frequency scale remains fixed width during zoom
- ✓ Smooth scrolling behavior maintained

## Related Issues
- Previous fix (zoom_scrolling_boundary_fix): Addressed container width mismatch
- This fix (v2): Addresses constraint function zoom awareness
- Both fixes work together to ensure proper zoom behavior

## Future Recommendations
1. **Use helper functions**: Always use `getZoomedContentWidth()` and `getZoomedContainerWidth()` for consistency
2. **Pass zoom level**: Any function dealing with boundaries should accept zoom level parameter
3. **Centralize calculations**: Avoid duplicating width/boundary logic
4. **Test at multiple zoom levels**: Always verify behavior at 1x, 2x, and max zoom
