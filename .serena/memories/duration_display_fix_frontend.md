# Duration Display Fix - Frontend Analysis & Solution

## Problem
Recordings in BSMarker frontend showed "Duration: Unknown" instead of actual duration values.

## Root Cause Analysis

### Frontend Issue Location
**File**: `/home/prusek/BSMarker/frontend/src/pages/ProjectDetailPage.tsx` - **Line 571**
```typescript
<span>Duration: {recording.duration ? `${recording.duration.toFixed(2)}s` : 'Unknown'}</span>
```

### TypeScript Interface
**File**: `/home/prusek/BSMarker/frontend/src/types/index.ts` - **Lines 21-30**
```typescript
export interface Recording {
  id: number;
  filename: string;
  original_filename: string;
  file_path: string;
  duration?: number;        // ← OPTIONAL FIELD (could be null/undefined)
  sample_rate?: number;
  project_id: number;
  created_at: string;
}
```

### Backend Context
- Duration is calculated during upload using `librosa.load()` and `librosa.get_duration()`
- If audio analysis fails during upload, `duration` field is set to `null`
- Backend provides backfill endpoint at `/api/v1/recordings/backfill-durations` to fix missing durations

## Solution Implementation

### 1. Created Duration Utility Functions
**File**: `/home/prusek/BSMarker/frontend/src/utils/duration.ts`

```typescript
/**
 * Format duration in seconds to human-readable format
 * @param seconds - Duration in seconds (can be null/undefined)
 * @param format - Format type: 'short' (e.g., '1.23s') or 'long' (e.g., '1:23')
 * @returns Formatted duration string
 */
export const formatDuration = (
  seconds: number | null | undefined, 
  format: 'short' | 'long' = 'short'
): string => {
  // Handle null, undefined, NaN, or zero
  if (!seconds || isNaN(seconds) || seconds <= 0) {
    return format === 'short' ? 'Unknown' : '0:00';
  }

  if (format === 'short') {
    // Format as "X.XXs" for display in lists
    return `${seconds.toFixed(2)}s`;
  } else {
    // Format as "M:SS" for audio players
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
};

export const hasValidDuration = (duration: number | null | undefined): boolean => {
  return !!(duration && !isNaN(duration) && duration > 0);
};

export const formatRecordingDuration = (
  duration: number | null | undefined,
  fallbackText: string = 'Unknown'
): string => {
  return hasValidDuration(duration) ? formatDuration(duration, 'short') : fallbackText;
};
```

### 2. Updated ProjectDetailPage Component
**File**: `/home/prusek/BSMarker/frontend/src/pages/ProjectDetailPage.tsx`

```typescript
// Import the utility
import { formatRecordingDuration } from '../utils/duration';

// Replace inline duration formatting
<span>Duration: {formatRecordingDuration(recording.duration)}</span>
```

### 3. Updated AudioPlayerControls Component  
**File**: `/home/prusek/BSMarker/frontend/src/components/annotation/AudioPlayerControls.tsx`

```typescript
// Import the utility
import { formatDuration } from '../../utils/duration';

// Replace local formatTime function
<span className="font-mono">{formatDuration(currentTime, 'long')}</span>
<span className="font-mono">{formatDuration(duration, 'long')}</span>
```

### 4. Added Unit Tests
**File**: `/home/prusek/BSMarker/frontend/src/utils/duration.test.ts`

Comprehensive test coverage for all duration utility functions.

## Deployment
1. Built frontend container successfully with `docker-compose -f docker-compose.prod.yml build frontend`
2. Restarted frontend service with `docker-compose -f docker-compose.prod.yml restart frontend`
3. Verified frontend is serving updated code

## Benefits of This Solution
1. **Centralized Duration Formatting**: All duration formatting now uses consistent utilities
2. **Consistent UX**: Same formatting logic applied across recording lists and audio players
3. **Robust Error Handling**: Properly handles null, undefined, NaN, and zero values
4. **Flexible Formatting**: Supports both short format (`123.45s`) and long format (`2:03`)
5. **Type Safety**: Full TypeScript support with proper typing
6. **Testable**: Comprehensive unit test coverage
7. **Future-Proof**: Easy to extend for additional formatting needs

## Future Improvements
1. Could add "Recalculate Duration" button for recordings with missing duration
2. Could implement frontend call to `/api/v1/recordings/backfill-durations` endpoint
3. Could add progress indicators for duration calculation in progress

## Files Changed
- `/home/prusek/BSMarker/frontend/src/utils/duration.ts` (new)
- `/home/prusek/BSMarker/frontend/src/utils/duration.test.ts` (new)
- `/home/prusek/BSMarker/frontend/src/pages/ProjectDetailPage.tsx` (updated)
- `/home/prusek/BSMarker/frontend/src/components/annotation/AudioPlayerControls.tsx` (updated)
