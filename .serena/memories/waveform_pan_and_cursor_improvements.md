# Waveform Pan and Cursor Positioning Improvements

## Issues Addressed

### 1. Enhanced Drag-to-Pan Functionality
**User Request**: Add easier pan functionality when clicking and dragging on the waveform.

**Solution Implemented**: Added right-click drag-to-pan as an additional panning method.

**Available Panning Methods**:
- **Middle mouse button** - Works in both waveform and spectrogram areas
- **Right mouse button** (NEW) - Works in both areas for convenient panning without modifiers
- **Left mouse + Shift/Ctrl** - Works in waveform area
- **Left mouse (no modifiers)** - Works in spectrogram area only (preserves click-to-seek in waveform)

### 2. Red Timeline Cursor Positioning Fix
**Problem**: The red cursor (timeline cursor) was misaligned with the boundary between dark blue (played) and light blue (unplayed) portions of the waveform when zoomed and panned.

**Root Cause**: Coordinate system inconsistency between:
- WaveSurfer's internal progress rendering (uses actual DOM `offsetWidth`)
- Timeline cursor position calculations (was using manual calculations)

**Solution**: Unified all timeline cursor position calculations to use `waveformContainer.offsetWidth` - the exact same measurement that WaveSurfer uses internally.

## Technical Implementation

### Files Modified
- `/frontend/src/pages/AnnotationEditor.tsx`

### Key Changes

#### 1. Right-Click Panning Support
```typescript
// In handleMouseDown - Added right-click handling
if (e.evt.button === 2) {
  e.evt.preventDefault();
  setIsPanning(true);
  setPanStartPos({
    x: e.evt.clientX,
    y: e.evt.clientY,
    scrollX: unifiedScrollRef.current?.scrollLeft || 0,
    scrollY: unifiedScrollRef.current?.scrollTop || 0,
  });
  return;
}
```

#### 2. Context Menu Integration
```typescript
// In handleContextMenu - Skip menu during panning
if (isPanning) {
  return;
}
```

#### 3. Timeline Cursor Position Calculation (Unified)
```typescript
// All WaveSurfer events and click handlers now use:
const waveformContainer = waveformRef.current;
if (waveformContainer) {
  const containerWidth = waveformContainer.offsetWidth;
  const position = relativePosition * containerWidth;
  setTimelineCursorPosition(position);
}
```

## Interaction Patterns

### Waveform Area
| Action | Effect |
|--------|--------|
| Left-click | Seek to position |
| Left-drag | Continuous seek while dragging |
| Right-click drag | Pan the view |
| Middle-click drag | Pan the view |
| Shift/Ctrl + Left-drag | Pan the view |

### Spectrogram Area
| Action | Effect |
|--------|--------|
| Left-click | Select/deselect bounding box |
| Left-drag (empty space) | Pan the view |
| Left-drag (on box) | Move bounding box |
| Right-click | Context menu (when not panning) |
| Right-click drag | Pan the view |
| Middle-click drag | Pan the view |

## Benefits

1. **Improved UX**: Users now have multiple intuitive ways to pan the view
2. **Consistent Behavior**: Right-click panning works uniformly across both areas
3. **Perfect Alignment**: Red cursor now perfectly aligns with WaveSurfer's progress boundary
4. **Non-Breaking**: All existing functionality preserved
5. **Performance**: No additional calculations - reuses existing coordinate systems

## Testing Verification

1. **TypeScript Compilation**: ✅ No errors
2. **ESLint**: ✅ No new warnings introduced
3. **Functionality Tests**:
   - Right-click panning works in both areas
   - Context menu still accessible when not panning
   - Click-to-seek preserved in waveform
   - Timeline cursor aligns perfectly at all zoom levels
   - All existing interactions continue to work

## Design Decisions

### Why Right-Click for Panning?
- Common UX pattern in many applications
- Doesn't conflict with existing left-click behaviors
- Provides modifier-free panning option
- Intuitive for users familiar with CAD/graphics software

### Why Not Simple Left-Click Drag in Waveform?
- Would break click-to-seek functionality
- Would conflict with drag-to-seek behavior
- Timeline/waveform areas traditionally use click for time navigation
- Preserves expected audio editing UX patterns

## Related Fixes
- Previous fix: [Timeline Cursor and Panning Fixes](timeline_cursor_and_panning_fixes.md)
- Previous fix: [Click-to-Seek Fix](click_to_seek_fix_non_annotation_mode.md)
