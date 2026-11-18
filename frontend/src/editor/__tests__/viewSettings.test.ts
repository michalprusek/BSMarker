import api from "../../services/api";
import type { EditorSettings, EditorSnapshot } from "../EditorEngine";
import {
  ViewSettingsSaver,
  initialEngineSettings,
} from "../edit/recordingPrefs";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
}));
const put = api.put as jest.Mock;

const BASE: EditorSettings = {
  fftSize: 1024,
  palette: "inverted-gray",
  defaultPalette: null,
  levels: { floor: -100, ceil: -30 },
  contrast: "standard",
  rangeDb: 50,
  followPlayback: true,
};
const snap = (settings: Partial<EditorSettings> = {}) =>
  ({ settings: { ...BASE, ...settings } }) as EditorSnapshot;

beforeEach(() => {
  jest.useFakeTimers();
  // CRA resets mock implementations before each test.
  put.mockReset().mockResolvedValue({});
});
afterEach(() => jest.useRealTimers());

describe("initial engine settings", () => {
  it("prefers the recording's own settings over the user's defaults", () => {
    expect(
      initialEngineSettings(
        { palette: "magma", range_db: 60 },
        { palette: "gray", fft_size: 2048 },
      ),
    ).toEqual({
      defaultPalette: "magma",
      palette: "gray",
      fftSize: 2048,
      rangeDb: 60,
    });
    expect(initialEngineSettings({ palette: "magma" }, {}).palette).toBe(
      "magma",
    );
  });

  it("restores hand-set levels only with custom contrast", () => {
    const levels = { floor: -90, ceil: -40 };
    expect(
      initialEngineSettings({}, { contrast: "custom", levels }).levels,
    ).toEqual(levels);
    expect(
      initialEngineSettings({}, { contrast: "standard", levels }).levels,
    ).toBeUndefined();
  });
});

describe("view settings saver", () => {
  it("does not save on open, then saves one debounced request per burst", () => {
    const saver = new ViewSettingsSaver(7, {}, {}, snap(), null, false);
    saver.update(snap(), null, false);
    jest.runAllTimers();
    expect(put).not.toHaveBeenCalled();

    saver.update(snap({ fftSize: 2048 }), null, false);
    saver.update(snap({ fftSize: 4096 }), null, false);
    jest.runAllTimers();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith("/editor-settings/recordings/7", {
      palette: null,
      fft_size: 4096,
      contrast: "standard",
      levels: null,
      freq_floor: null,
    });
  });

  it("keeps a palette that only came from the defaults out of the recording", () => {
    const saver = new ViewSettingsSaver(
      7,
      {},
      { palette: "magma" },
      snap({ palette: "magma" }),
      null,
      false,
    );
    saver.update(snap({ palette: "magma", fftSize: 512 }), null, false);
    jest.runAllTimers();
    expect(put.mock.calls[0][1].palette).toBeNull();

    saver.update(snap({ palette: "gray", fftSize: 512 }), null, false);
    jest.runAllTimers();
    expect(put.mock.calls[1][1].palette).toBe("gray");
  });

  it("saves a new default palette to the defaults", () => {
    const saver = new ViewSettingsSaver(7, {}, {}, snap(), null, false);
    saver.update(
      snap({ palette: "magma", defaultPalette: "magma" }),
      null,
      false,
    );
    jest.runAllTimers();
    expect(put).toHaveBeenCalledWith("/editor-settings/defaults", {
      palette: "magma",
      range_db: 50,
    });
  });

  it("carries a floor from this browser over to the server", () => {
    new ViewSettingsSaver(7, {}, {}, snap(), 1500, false);
    jest.runAllTimers();
    expect(put.mock.calls[0][1].freq_floor).toBe(1500);
  });

  it("never overwrites settings it could not load", () => {
    const saver = new ViewSettingsSaver(7, null, null, snap(), 1500, false);
    saver.update(snap({ fftSize: 2048, rangeDb: 70 }), 1500, false);
    jest.runAllTimers();
    saver.destroy();
    expect(put).not.toHaveBeenCalled();
  });

  it("does not pin the default palette to the recording", () => {
    const saver = new ViewSettingsSaver(7, {}, {}, snap(), null, false);
    saver.update(
      snap({ palette: "magma", defaultPalette: "magma" }),
      null,
      false,
    );
    saver.update(
      snap({ palette: "magma", defaultPalette: "magma", fftSize: 512 }),
      null,
      false,
    );
    jest.runAllTimers();
    const recording = put.mock.calls.find(([url]) =>
      url.includes("/recordings/"),
    );
    expect(recording?.[1].palette).toBeNull();
  });

  it("sends pending changes when leaving the recording", () => {
    const saver = new ViewSettingsSaver(7, {}, {}, snap(), null, false);
    saver.update(snap({ fftSize: 2048 }), null, false);
    saver.destroy();
    jest.runAllTimers();
    expect(put).toHaveBeenCalledTimes(1);
  });
});
