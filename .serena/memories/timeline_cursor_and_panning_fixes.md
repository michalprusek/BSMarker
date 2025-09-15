# Timeline Cursor and Bounding Box Panning Fixes

## Issues Identified and Fixed

### 1. Timeline Cursor Not Following Audio Playback
**Problem**: The red timeline cursor (posuvník) was not moving smoothly with the audio playback position. It only updated on `audioprocess` events which fire infrequently.

**Root Cause**: 
- Missing `timeupdate` event listener for smooth cursor updates
- Timeline cursor position calculation was incorrectly multiplying by `zoomLevel` twice

**Solution Implemented**:
1. Added `timeupdate` event listener to WaveSurfer for smoother cursor updates during playback
2. Fixed the timeline cursor rendering to not multiply by `zoomLevel` (the position is already in zoomed coordinates)
3. Added cursor position updates on `play`, `pause`, and `finish` events for immediate feedback

### 2. Bounding Boxes Drifting During Horizontal Panning
**Problem**: When performing horizontal pan (dragging), the bounding boxes would drift/misalign from their correct positions.

**Root Cause**:
- Double transformation of coordinates - bounding boxes were already transformed to screen coordinates via `transformBoxToScreen` but the timeline cursor was applying zoom again
- Stage component positioning issues within the scroll container

**Solution Implemented**:
1. Fixed the timeline cursor Line component to use `timelineCursorPosition` directly without multiplying by `zoomLevel`
2. Ensured Stage component has correct positioning (y offset kept for vertical consistency)
3. Verified coordinate transformation pipeline is consistent throughout

## Technical Details

### Files Modified
- `/frontend/src/pages/AnnotationEditor.tsx`

### Key Changes

1. **WaveSurfer Event Handlers**:
   - Added `timeupdate` event for smooth cursor tracking
   - Enhanced `play`, `pause`, and `finish` events to update cursor position
   - Removed incorrect `seek` event (doesn't exist in WaveSurfer types)

2. **Timeline Cursor Rendering**:
   ```tsx
   // Before (incorrect):
   points={[
     timelineCursorPosition * zoomLevel,
     0,
     timelineCursorPosition * zoomLevel,
     spectrogramDimensions.height
   ]}
   
   // After (correct):
   points={[
     timelineCursorPosition,  // Already in zoomed coordinates
     0,
     timelineCursorPosition,  // Already in zoomed coordinates
     spectrogramDimensions.height
   ]}
   ```

3. **Stage Component Positioning**:
   - Kept `y={-zoomOffset.y}` for vertical offset consistency
   - Stage is positioned inside scroll container with frequency scale offset

## Coordinate System Architecture

The application uses a layered coordinate transformation system:

1. **World Coordinates**: Base unzoomed coordinates
2. **Screen Coordinates**: Zoomed coordinates for display
3. **Stage Coordinates**: Relative to the Konva Stage inside the scroll container

The Stage is positioned inside the unified scroll container, so:
- Horizontal scrolling is handled by the container's scrollLeft
- Mouse coordinates are already relative to the scrolled position
- No need to add scrollOffset when transforming coordinates

## Testing Performed

1. TypeScript compilation: ✅ No errors
2. ESLint checking: ✅ No new warnings introduced
3. Coordinate transformation consistency: ✅ Verified

## Best Practices Applied

1. **Single Source of Truth (SSOT)**: Centralized coordinate transformations in utility functions
2. **Event-Driven Updates**: Using WaveSurfer's native events for synchronization
3. **Performance Optimization**: Using throttled updates and memoized calculations
4. **Type Safety**: All changes maintain TypeScript type safety