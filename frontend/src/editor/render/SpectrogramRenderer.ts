import { Viewport } from "../core/Viewport";
import { DB_MAX, DB_MIN } from "../dsp/db";
import { ReadyTile } from "../dsp/TileScheduler";
import { TILE_COLS, TileId, tileIndexRange, tileKey, tileTimeRange } from "../dsp/tiles";
import { PaletteName, buildLut } from "./palettes";

const VERTEX_SHADER = `#version 300 es
in vec2 a_unit;
uniform vec4 u_dst; // x0, y0, x1, y1 in clip space
uniform vec4 u_src; // u0, v0, u1, v1 in texture space
out vec2 v_uv;
void main() {
  gl_Position = vec4(mix(u_dst.xy, u_dst.zw, a_unit), 0.0, 1.0);
  v_uv = mix(u_src.xy, u_src.zw, a_unit);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tile;
uniform sampler2D u_lut;
uniform vec2 u_levels; // lo, hi in normalised dB (0..1)
out vec4 outColor;
void main() {
  float db = texture(u_tile, v_uv).r;
  float t = clamp((db - u_levels.x) / max(u_levels.y - u_levels.x, 1e-4), 0.0, 1.0);
  outColor = texture(u_lut, vec2(t, 0.5));
}`;

/** GPU memory we allow tile textures to occupy before evicting (LRU). */
const TEXTURE_BUDGET_BYTES = 256 * 1024 * 1024;

interface CachedTile {
  texture: WebGLTexture;
  bins: number;
  bytes: number;
  lastUsedFrame: number;
}

export interface SpectrogramDrawParams {
  fftSize: number;
  level: number;
  maxLevel: number;
  sampleRate: number;
  totalSamples: number;
}

const toNormalisedDb = (db: number): number => (db - DB_MIN) / (DB_MAX - DB_MIN);

/**
 * Draws the visible spectrogram tiles with WebGL2. Colour mapping and
 * frequency zoom happen in the shader, so they cost nothing to change.
 */
export class SpectrogramRenderer {
  private gl!: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private lutTexture!: WebGLTexture;
  private quadBuffer!: WebGLBuffer;
  private uniforms!: Record<"dst" | "src" | "tile" | "lut" | "levels", WebGLUniformLocation | null>;
  private readonly cache = new Map<string, CachedTile>();
  private cacheBytes = 0;
  private frame = 0;
  private palette: PaletteName = "inverted-gray";
  private background: [number, number, number] = [1, 1, 1];
  private levels: [number, number] = [0, 1];
  private contextLost = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onContextRestored: () => void,
  ) {
    this.init();
    canvas.addEventListener("webglcontextlost", this.handleContextLost);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  get cachedTileCount(): number {
    return this.cache.size;
  }

  setPalette(palette: PaletteName): void {
    this.palette = palette;
    this.uploadLut();
  }

  setLevels(dbFloor: number, dbCeil: number): void {
    this.levels = [toNormalisedDb(dbFloor), toNormalisedDb(dbCeil)];
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  }

  addTile({ key, data, bins }: ReadyTile): void {
    if (this.contextLost || this.cache.has(key)) return;
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, TILE_COLS, bins, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.cache.set(key, { texture, bins, bytes: data.byteLength, lastUsedFrame: this.frame });
    this.cacheBytes += data.byteLength;
    this.evict();
  }

  /** Drops every cached tile texture. */
  clear(): void {
    this.cache.forEach((t) => this.gl.deleteTexture(t.texture));
    this.cache.clear();
    this.cacheBytes = 0;
  }

  draw(view: Viewport, p: SpectrogramDrawParams): void {
    if (this.contextLost) return;
    this.frame++;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(this.background[0], this.background[1], this.background[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.levels, this.levels[0], this.levels[1]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
    gl.uniform1i(this.uniforms.lut, 1);
    gl.uniform1i(this.uniforms.tile, 0);
    gl.activeTexture(gl.TEXTURE0);

    const [first, last] = tileIndexRange(
      p.fftSize, p.level, p.sampleRate, p.totalSamples, view.t0, view.t1,
    );

    // Pass 1: stand-ins for tiles that are still being computed.
    for (let i = first; i <= last; i++) {
      if (!this.cache.has(tileKey({ fftSize: p.fftSize, level: p.level, index: i }))) {
        this.drawFallback(view, p, i);
      }
    }
    // Pass 2: exact tiles on top.
    for (let i = first; i <= last; i++) {
      this.drawTile(view, p, { fftSize: p.fftSize, level: p.level, index: i }, 0, 1);
    }
  }

  destroy(): void {
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    if (this.contextLost) return;
    this.clear();
    const gl = this.gl;
    gl.deleteTexture(this.lutTexture);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteProgram(this.program);
  }

  /** Use a coarser ancestor (blurry) or finer children (sharp) while waiting. */
  private drawFallback(view: Viewport, p: SpectrogramDrawParams, index: number): void {
    for (let level = p.level + 1, factor = 2; level <= p.maxLevel; level++, factor *= 2) {
      const parent = Math.floor(index / factor);
      const sub = index - parent * factor;
      if (this.drawTile(view, p, { fftSize: p.fftSize, level, index: parent }, sub / factor, (sub + 1) / factor)) {
        return;
      }
    }
    for (const child of [2 * index, 2 * index + 1]) {
      this.drawTile(view, p, { fftSize: p.fftSize, level: p.level - 1, index: child }, 0, 1);
    }
  }

  /** Draws the [u0, u1] horizontal slice of a cached tile. Returns false if not cached. */
  private drawTile(view: Viewport, p: SpectrogramDrawParams, tile: TileId, u0: number, u1: number): boolean {
    const cached = this.cache.get(tileKey(tile));
    if (!cached) return false;
    cached.lastUsedFrame = this.frame;

    const [ta, tb] = tileTimeRange(tile, p.sampleRate);
    const sliceStart = ta + (tb - ta) * u0;
    const sliceEnd = ta + (tb - ta) * u1;
    const toClipX = (t: number) => (view.timeToX(t) / view.width) * 2 - 1;

    // Frequency → texture row. Bin b (frequency b·Δf) has its texel centre at (b + 0.5) / bins.
    const binHz = p.sampleRate / p.fftSize;
    const toV = (f: number) => (f / binHz + 0.5) / cached.bins;

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, cached.texture);
    gl.uniform4f(this.uniforms.dst, toClipX(sliceStart), -1, toClipX(sliceEnd), 1);
    gl.uniform4f(this.uniforms.src, u0, toV(view.f0), u1, toV(view.f1));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  private evict(): void {
    if (this.cacheBytes <= TEXTURE_BUDGET_BYTES) return;
    const byAge = Array.from(this.cache.entries()).sort((a, b) => a[1].lastUsedFrame - b[1].lastUsedFrame);
    for (const [key, tile] of byAge) {
      if (this.cacheBytes <= TEXTURE_BUDGET_BYTES * 0.8) break;
      if (tile.lastUsedFrame >= this.frame) continue; // on screen right now
      this.gl.deleteTexture(tile.texture);
      this.cache.delete(key);
      this.cacheBytes -= tile.bytes;
    }
  }

  private init(): void {
    const gl = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    this.gl = gl;
    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.uniforms = {
      dst: gl.getUniformLocation(this.program, "u_dst"),
      src: gl.getUniformLocation(this.program, "u_src"),
      tile: gl.getUniformLocation(this.program, "u_tile"),
      lut: gl.getUniformLocation(this.program, "u_lut"),
      levels: gl.getUniformLocation(this.program, "u_levels"),
    };

    const quad = gl.createBuffer();
    if (!quad) throw new Error("Failed to create vertex buffer.");
    this.quadBuffer = quad;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, "a_unit");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const lutTexture = gl.createTexture();
    if (!lutTexture) throw new Error("Failed to create colour map texture.");
    this.lutTexture = lutTexture;
    this.uploadLut();
  }

  private uploadLut(): void {
    const gl = this.gl;
    const lut = buildLut(this.palette);
    this.background = [lut[0] / 255, lut[1] / 255, lut[2] / 255];
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
  }

  private handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.cache.clear();
    this.cacheBytes = 0;
  };

  private handleContextRestored = (): void => {
    this.contextLost = false;
    this.init();
    this.onContextRestored();
  };
}

function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Failed to create shader.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  };
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create WebGL program.");
  const shaders = [compile(gl.VERTEX_SHADER, vs), compile(gl.FRAGMENT_SHADER, fs)];
  shaders.forEach((shader) => gl.attachShader(program, shader));
  gl.linkProgram(program);
  // The linked program keeps what it needs; the shader objects can go.
  shaders.forEach((shader) => {
    gl.detachShader(program, shader);
    gl.deleteShader(shader);
  });
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Shader link error: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}
