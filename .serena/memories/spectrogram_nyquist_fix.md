# Spectrogram Nyquist Frequency Fix

## Problem Fixed
The spectrogram generation was using a hardcoded maximum frequency of 10,000 Hz regardless of the recording's actual sample rate, causing incorrect frequency representation in spectrograms.

## Solution Implemented
Updated `/home/prusek/BSMarker/backend/app/tasks/spectrogram_tasks.py` to:

### 1. Function Signature Enhancement
- Added `max_frequency` parameter to `generate_spectrogram_image()` function
- Defaults to Nyquist frequency (sample_rate / 2) when not specified

### 2. Dynamic Frequency Calculation
- Calculate Nyquist frequency as `sr // 2` for each recording
- Use actual Nyquist frequency instead of hardcoded 10,000 Hz
- Added logging to show the frequency being used

### 3. Database Parameter Updates
- Store actual `max_frequency` (Nyquist) in spectrogram parameters
- Added `nyquist_frequency` field to parameters for reference
- Update recording sample rate if it differs from loaded audio

### 4. Key Changes Made
```python
# Before: Fixed 10000 Hz
max_freq_idx = np.where(freqs <= 10000)[0][-1]

# After: Adaptive Nyquist frequency
if max_frequency is None:
    max_frequency = sr // 2
max_freq_idx = np.where(freqs <= max_frequency)[0][-1]
```

## Impact
- **22050 Hz recordings**: Now show up to 11,025 Hz (was limited to 10,000 Hz)
- **44100 Hz recordings**: Now show up to 22,050 Hz (was limited to 10,000 Hz)  
- **48000 Hz recordings**: Now show up to 24,000 Hz (was limited to 10,000 Hz)
- **Low sample rate recordings**: Properly limited to their actual Nyquist frequency

## Testing
Verified frequency calculation logic works correctly for various sample rates:
- 8000 Hz -> 4000 Hz Nyquist
- 16000 Hz -> 8000 Hz Nyquist
- 22050 Hz -> 11025 Hz Nyquist
- 44100 Hz -> 22050 Hz Nyquist
- 48000 Hz -> 24000 Hz Nyquist

## Database Schema
The Recording model already had `sample_rate` field. The fix now properly uses this field and updates it if needed during processing.
