# Zoom-to-Cursor Test Guide

## What Was Fixed

The zoom-to-cursor functionality has been fixed for both the spectrogram and waveform. The issue was that the code was using `zoomOffset.x` (which was always 0) instead of the actual scroll position when calculating the world coordinates.

## Changes Made

In `/frontend/src/pages/AnnotationEditor.tsx` (lines 2257-2262):

**Before:**
```typescript
// Calculate world coordinates at cursor position (horizontal only)
const worldX = (cursorX + zoomOffset.x) / zoomLevel;
```

**After:**
```typescript
// Get current scroll position
const currentScrollLeft = unifiedScrollRef.current?.scrollLeft || 0;

// Calculate world coordinates at cursor position (horizontal only)
// World position = (cursor position in viewport + scroll offset) / current zoom
const worldX = (cursorX + currentScrollLeft) / zoomLevel;
```

## How Zoom-to-Cursor Works

1. **World Coordinate Preservation**: When you zoom with the mouse wheel, the point under your cursor maintains its position in "world coordinates" (unzoomed space)
2. **Scroll Adjustment**: The scroll position is automatically adjusted so that the point under your cursor stays in the same place on screen
3. **Synchronized Movement**: Both spectrogram and waveform are in the same scroll container, so they zoom and scroll together

## Testing Instructions

### Prerequisites
1. Log in to the BSMarker application
2. Open a recording with an existing spectrogram

### Test Cases

#### Test 1: Basic Zoom-to-Cursor
1. Position your cursor at the **beginning** of the spectrogram
2. Scroll the mouse wheel up (zoom in)
3. **Expected**: The left edge of the spectrogram should stay under your cursor
4. Scroll the mouse wheel down (zoom out)
5. **Expected**: The left edge should remain under your cursor

#### Test 2: Middle Point Zoom
1. Position your cursor at the **middle** of the spectrogram
2. Scroll the mouse wheel up to zoom in
3. **Expected**: The middle point should stay under your cursor
4. Move cursor to a different point and zoom again
5. **Expected**: The new point should become the zoom center

#### Test 3: End Point Zoom
1. Scroll to see the **end** of the spectrogram
2. Position cursor near the right edge
3. Zoom in with mouse wheel
4. **Expected**: The right edge area should stay under your cursor

#### Test 4: Waveform Synchronization
1. Position cursor over the waveform (bottom section)
2. Zoom with mouse wheel
3. **Expected**: Both waveform and spectrogram zoom together
4. **Expected**: Time alignment between waveform and spectrogram is maintained

#### Test 5: Zoom Limits
1. Zoom out completely (scroll wheel down repeatedly)
2. **Expected**: Zoom stops at 100% (1x)
3. Zoom in completely (scroll wheel up repeatedly)
4. **Expected**: Zoom stops at 600% (6x)

#### Test 6: Annotation Preservation
1. Create a bounding box annotation
2. Position cursor near the annotation
3. Zoom in and out
4. **Expected**: Annotation stays in correct position relative to spectrogram

### Visual Verification

The zoom should feel natural and intuitive:
- The point under your cursor should remain stationary during zoom
- Zooming should be smooth (60 FPS throttled)
- No jumping or flickering should occur
- Both spectrogram and waveform should remain synchronized

## Technical Details

### Coordinate System
- **Screen Coordinates**: Pixels on screen (affected by zoom)
- **World Coordinates**: Original unzoomed coordinates
- **Transformation**: `worldX = (screenX + scrollOffset) / zoomLevel`

### Performance Optimizations
- Throttled to 60 FPS using `throttle(..., 16)`
- Uses `requestAnimationFrame` for smooth visual updates
- Memoized handlers to prevent unnecessary re-renders

### Zoom Parameters
- **Min Zoom**: 1x (100%)
- **Max Zoom**: 6x (600%)
- **Zoom Speed**: 0.002 (exponential factor)
- **Zoom Type**: Horizontal only (vertical zoom disabled for spectrograms)

## Troubleshooting

If zoom-to-cursor doesn't work as expected:

1. **Clear browser cache**: Ensure latest JavaScript is loaded
2. **Check console**: Look for any JavaScript errors
3. **Verify scroll container**: Ensure the scroll container is properly initialized
4. **Test in different browser**: Try Chrome/Firefox/Edge

## Related Code

Key files involved in zoom functionality:
- `/frontend/src/pages/AnnotationEditor.tsx` - Main zoom implementation
- `/frontend/src/utils/coordinates.ts` - Coordinate transformation utilities
- `/frontend/src/hooks/useMouseCoordinates.ts` - Mouse coordinate handling