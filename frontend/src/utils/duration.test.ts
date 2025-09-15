/**
 * Unit tests for duration formatting utilities
 */

import {
  formatDuration,
  hasValidDuration,
  formatRecordingDuration,
} from "./duration";

describe("Duration utilities", () => {
  describe("formatDuration", () => {
    it("should format valid duration in short format", () => {
      expect(formatDuration(123.456, "short")).toBe("123.46s");
      expect(formatDuration(5.0, "short")).toBe("5.00s");
      expect(formatDuration(0.12, "short")).toBe("0.12s");
    });

    it("should format valid duration in long format", () => {
      expect(formatDuration(65, "long")).toBe("1:05");
      expect(formatDuration(125, "long")).toBe("2:05");
      expect(formatDuration(45, "long")).toBe("0:45");
      expect(formatDuration(7265, "long")).toBe("121:05");
    });

    it("should handle null/undefined/invalid values in short format", () => {
      expect(formatDuration(null, "short")).toBe("Unknown");
      expect(formatDuration(undefined, "short")).toBe("Unknown");
      expect(formatDuration(NaN, "short")).toBe("Unknown");
      expect(formatDuration(0, "short")).toBe("Unknown");
      expect(formatDuration(-5, "short")).toBe("Unknown");
    });

    it("should handle null/undefined/invalid values in long format", () => {
      expect(formatDuration(null, "long")).toBe("0:00");
      expect(formatDuration(undefined, "long")).toBe("0:00");
      expect(formatDuration(NaN, "long")).toBe("0:00");
      expect(formatDuration(0, "long")).toBe("0:00");
    });

    it("should default to short format when no format specified", () => {
      expect(formatDuration(123.456)).toBe("123.46s");
    });
  });

  describe("hasValidDuration", () => {
    it("should return true for valid durations", () => {
      expect(hasValidDuration(1)).toBe(true);
      expect(hasValidDuration(123.456)).toBe(true);
      expect(hasValidDuration(0.01)).toBe(true);
    });

    it("should return false for invalid durations", () => {
      expect(hasValidDuration(null)).toBe(false);
      expect(hasValidDuration(undefined)).toBe(false);
      expect(hasValidDuration(NaN)).toBe(false);
      expect(hasValidDuration(0)).toBe(false);
      expect(hasValidDuration(-5)).toBe(false);
    });
  });

  describe("formatRecordingDuration", () => {
    it("should format valid duration with short format", () => {
      expect(formatRecordingDuration(123.456)).toBe("123.46s");
    });

    it("should return default fallback for invalid duration", () => {
      expect(formatRecordingDuration(null)).toBe("Unknown");
      expect(formatRecordingDuration(undefined)).toBe("Unknown");
      expect(formatRecordingDuration(0)).toBe("Unknown");
    });

    it("should use custom fallback text", () => {
      expect(formatRecordingDuration(null, "N/A")).toBe("N/A");
      expect(formatRecordingDuration(undefined, "Processing...")).toBe(
        "Processing...",
      );
    });
  });
});
