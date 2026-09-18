export type PaletteName = "inverted-gray" | "gray" | "magma";

export const PALETTES: { id: PaletteName; label: string }[] = [
  { id: "inverted-gray", label: "Grayscale (white background)" },
  { id: "gray", label: "Grayscale (black background)" },
  { id: "magma", label: "Magma" },
];

type Rgb = [number, number, number];

// Polynomial fit of matplotlib's magma colormap (t in 0..1).
const MAGMA: Rgb[] = [
  [-0.002136485053939582, -0.000749655052795221, -0.005386127855323933],
  [0.2516605407371642, 0.6775232436837668, 2.494026599312351],
  [8.353717279216625, -3.577719514958484, 0.3144679030132573],
  [-27.66873308576866, 14.26473078096533, -13.64921318813922],
  [52.17613981234068, -27.94360607168351, 12.94416944238394],
  [-50.76852536473588, 29.04658282127291, 4.23415299384598],
  [18.65570506591883, -11.48977351997711, -5.601961508734096],
];

const polynomial = (coeffs: Rgb[], t: number): Rgb => {
  const rgb: Rgb = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    let v = 0;
    for (let i = coeffs.length - 1; i >= 0; i--) v = v * t + coeffs[i][ch];
    rgb[ch] = Math.min(1, Math.max(0, v));
  }
  return rgb;
};

const colorAt = (palette: PaletteName, t: number): Rgb => {
  switch (palette) {
    case "inverted-gray":
      return [1 - t, 1 - t, 1 - t];
    case "gray":
      return [t, t, t];
    case "magma":
      return polynomial(MAGMA, t);
  }
};

/** 256 RGBA entries; index 0 = quietest, 255 = loudest. */
export const buildLut = (palette: PaletteName): Uint8Array => {
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = colorAt(palette, i / 255);
    lut.set([Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255], i * 4);
  }
  return lut;
};

/** CSS colour of the quietest level — used for the plot background. */
export const backgroundColor = (palette: PaletteName): string => {
  const [r, g, b] = colorAt(palette, 0).map((v) => Math.round(v * 255));
  return `rgb(${r}, ${g}, ${b})`;
};
