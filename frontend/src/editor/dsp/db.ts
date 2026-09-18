/**
 * Tiles store power in dBFS quantised to 8 bits over [DB_MIN, DB_MAX]
 * (~0.5 dB per step). Contrast/brightness are applied later on the GPU,
 * so changing them never requires recomputation.
 */
export const DB_MIN = -130;
export const DB_MAX = 0;
