# Click-to-Seek Fix for Non-Annotation Mode

## Problem Identified
The user reported that clicking on the spectrogram or waveform when annotation mode is OFF was not moving the red timeline cursor (časový posuvník) to the clicked position. The audio should seek to the horizontal position of the click, regardless of zoom and pan state.

## Root Cause Analysis
After comprehensive analysis, we found that:

1. **Timeline cursor visual update was working**: The cursor position was being calculated and updated on every click (line 1246 in `handleMouseDown`)
2. **Audio seeking was NOT working properly**: The `wavesurferRef.current.seekTo()` was only being called in specific conditions that had early returns

### The Logic Flow Issue:
- When `isAnnotationMode = false` and clicking on a bounding box, the function would handle box interaction and return early (line 1366)
- This prevented the click-to-seek code from executing in the spectrogram area
- The click-to-seek code was duplicated in multiple places (waveform area and spectrogram area) instead of being centralized

## Solution Implemented

### Key Changes in `/frontend/src/pages/AnnotationEditor.tsx`:

1. **Moved click-to-seek logic to the top level** (lines 1248-1254):
   - Added immediate audio seeking after coordinate calculation
   - Executes BEFORE any early returns for bounding box handling
   - Works for both spectrogram and waveform areas

```typescript
// Perform audio seeking when not in annotation mode and clicking with left mouse button
// This ensures audio seeks regardless of whether clicking on empty space or near bounding boxes
if (!isAnnotationMode && e.evt.button === 0 && wavesurferRef.current && duration > 0 &&
    !e.evt.shiftKey && !e.evt.ctrlKey && !e.evt.metaKey) {
  const clampedSeekPosition = clampSeekPosition(seekPosition);
  wavesurferRef.current.seekTo(clampedSeekPosition);
}
```

2. **Removed duplicate click-to-seek code**:
   - Removed redundant seeking logic from waveform area (was lines 1252-1258)
   - Removed redundant seeking logic from spectrogram area (was lines 1372-1377)
   - Followed SSOT principle by centralizing the seeking logic

## Technical Details

### Conditions for Click-to-Seek:
1. `!isAnnotationMode` - Annotation mode must be OFF
2. `e.evt.button === 0` - Left mouse button click
3. `wavesurferRef.current` - WaveSurfer must be initialized
4. `duration > 0` - Audio must be loaded with valid duration
5. No modifier keys pressed (`!shiftKey && !ctrlKey && !metaKey`)

### Coordinate Transformation:
- Uses centralized `transformMousePoint()` hook from `useMouseCoordinates`
- Calculates `seekPosition` (normalized 0-1 range) invariant to zoom and scroll
- `clampSeekPosition()` ensures the value stays within valid bounds

### Visual Feedback:
- Timeline cursor position updates immediately via `setTimelineCursorPosition()`
- Audio seeks via WaveSurfer's native `seekTo()` method
- WaveSurfer's 'interaction' event handles further synchronization

## Testing Verification
1. **TypeScript compilation**: ✅ No errors
2. **ESLint**: ✅ No new warnings (existing warnings unrelated to changes)
3. **Functionality**:
   - Click-to-seek works when annotation mode is OFF
   - Works on both empty areas and areas with bounding boxes
   - Works in both spectrogram and waveform areas
   - Respects zoom and pan state correctly
   - Modifier keys (Shift/Ctrl) properly prevent seeking (used for selection/panning)

## Best Practices Applied
1. **Single Source of Truth (SSOT)**: Removed duplicate code, centralized seeking logic
2. **Early execution**: Moved critical logic before early returns
3. **Consistent behavior**: Same seeking behavior across all click areas
4. **Performance**: No additional calculations, reuses existing coordinate transformations
5. **Maintainability**: Simpler code structure with less duplication

## Impact
- Users can now click anywhere on the spectrogram or waveform to seek when annotation mode is OFF
- The red timeline cursor properly moves to the clicked position
- Audio playback position synchronizes with the visual cursor
- No regression in annotation mode functionality or bounding box interactions