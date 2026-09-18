/**
 * Shared constants (single source of truth).
 */

/** Box colours; index 0 is for unlabelled ("None") boxes. */
export const LABEL_COLORS = [
  { stroke: "#6B7280", fill: "rgba(107, 114, 128, 0.2)" }, // Gray for "None"
  { stroke: "#DC2626", fill: "rgba(220, 38, 38, 0.25)" }, // Red
  { stroke: "#F59E0B", fill: "rgba(245, 158, 11, 0.25)" }, // Amber
  { stroke: "#10B981", fill: "rgba(16, 185, 129, 0.25)" }, // Emerald
  { stroke: "#2563EB", fill: "rgba(37, 99, 235, 0.25)" }, // Blue
  { stroke: "#9333EA", fill: "rgba(147, 51, 234, 0.25)" }, // Violet
  { stroke: "#EC4899", fill: "rgba(236, 72, 153, 0.25)" }, // Pink
  { stroke: "#14B8A6", fill: "rgba(20, 184, 166, 0.25)" }, // Teal
  { stroke: "#F97316", fill: "rgba(249, 115, 22, 0.25)" }, // Orange
  { stroke: "#84CC16", fill: "rgba(132, 204, 22, 0.25)" }, // Lime
] as const;
