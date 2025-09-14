# Timeline Cursor and WaveSurfer Synchronization Fix

## Problem Description
The red timeline cursor was not properly aligning with WaveSurfer's progress indicator (boundary between dark blue and light blue). When clicking on the waveform, the position was correct, but clicking on the spectrogram positioned the cursor incorrectly.

## Root Cause Analysis

### SSOT Violation
The application had **multiple sources of truth** for the current playback position:
1. React state (`currentTime`)
2. WaveSurfer's internal state (`wavesurferRef.current.getCurrentTime()`)
3. Manual calculations (`clampedSeekPosition * duration`)

### Race Condition
When clicking on the spectrogram:
1. Code called `wavesurferRef.current.seekTo(clampedSeekPosition)`
2. Then **manually** set `setCurrentTime(clampedSeekPosition * duration)` 
3. This created a race condition where:
   - Manual `setCurrentTime` immediately positioned the red cursor
   - WaveSurfer's 'interaction' event then fired with the actual position
   - The cursor ended up at the wrong position

## Solution Implementation

### Primary Fix
**Removed all manual `setCurrentTime()` calls after `seekTo()`** to establish WaveSurfer as the single source of truth.

### Changes Made

#### 1. Removed manual update in rewind function (line 940)
```typescript
// Before:
wavesurferRef.current.seekTo(newTime / duration);
setCurrentTime(newTime);  // ❌ Manual update

// After:
wavesurferRef.current.seekTo(newTime / duration);
// Don't set currentTime manually - let WaveSurfer's 'seek' event handle it
```

#### 2. Event Handlers (lines 870-878)
Kept only the essential WaveSurfer event handlers:
```typescript
wavesurfer.on('audioprocess', () => {
  const time = wavesurfer.getCurrentTime();
  setCurrentTime(time);
});

wavesurfer.on('interaction', () => {
  const time = wavesurfer.getCurrentTime();
  setCurrentTime(time);
});
```

## Key Design Principles

### Single Source of Truth
- **WaveSurfer** is now the only authoritative source for playback position
- All position updates come through WaveSurfer events
- No manual synchronization attempts

### Event-Driven Updates
- `audioprocess`: Updates during playback
- `interaction`: Updates during user interactions (clicks, drags)
- Both events call `wavesurferRef.current.getCurrentTime()` for the actual position

## Files Modified
- `/frontend/src/pages/AnnotationEditor.tsx`
  - Line 940: Removed manual setCurrentTime in rewind
  - Lines 870-878: Consolidated event handlers

## Testing Verification
- ✅ TypeScript compilation passes
- ✅ Red cursor aligns with WaveSurfer progress boundary
- ✅ Consistent behavior between waveform and spectrogram clicks
- ✅ Works correctly at all zoom levels
- ✅ Works correctly with scroll offset

## Related Issues
- Previous boundary constraint fix addressed coordinate calculation issues
- This fix addresses state synchronization issues
- Together they ensure proper timeline behavior

## Best Practices

### DO:
- Let WaveSurfer manage its own state
- Use WaveSurfer events for all position updates
- Trust WaveSurfer's `getCurrentTime()` as the source of truth

### DON'T:
- Manually calculate and set currentTime after seekTo
- Try to predict WaveSurfer's position mathematically
- Create multiple sources of truth for playback position

## Future Recommendations
1. Consider creating a custom hook `useWaveSurferPosition()` to centralize position management
2. Add debug logging if synchronization issues reappear
3. Document that WaveSurfer is the authoritative source for playback position
