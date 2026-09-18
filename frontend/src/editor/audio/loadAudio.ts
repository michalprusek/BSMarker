import api from "../../services/api";

export interface DecodedAudio {
  /** Original (possibly multi-channel) buffer, used for playback. */
  buffer: AudioBuffer;
  /** Mono mix at the native sample rate, used for analysis. */
  pcm: Float32Array;
  sampleRate: number;
  duration: number;
}

const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Downloads and decodes a recording at its native sample rate.
 *
 * decodeAudioData resamples to the rate of the context it runs on, so we
 * decode on an OfflineAudioContext created with the recording's own rate —
 * otherwise a 48 kHz file on a 44.1 kHz sound card would be analysed resampled.
 */
export async function loadRecordingAudio(
  recordingId: number,
  nativeSampleRate: number | undefined,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<DecodedAudio> {
  const response = await api.get<ArrayBuffer>(`/recordings/${recordingId}/audio`, {
    responseType: "arraybuffer",
    timeout: DOWNLOAD_TIMEOUT_MS,
    signal,
    onDownloadProgress: (e) => {
      if (onProgress && e.total) onProgress(e.loaded / e.total);
    },
  });

  // The backend stores the native rate for every processed recording; the
  // fallback only matters for recordings whose processing never ran.
  const sampleRate = nativeSampleRate || 48000;
  const decoder = new OfflineAudioContext(1, 1, sampleRate);
  const buffer = await decoder.decodeAudioData(response.data);

  return {
    buffer,
    pcm: mixToMono(buffer),
    sampleRate: buffer.sampleRate,
    duration: buffer.duration,
  };
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const mono = new Float32Array(buffer.length);
  const gain = 1 / buffer.numberOfChannels;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] * gain;
  }
  return mono;
}
