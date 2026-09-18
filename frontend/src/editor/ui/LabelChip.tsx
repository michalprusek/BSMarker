import React from "react";
import { LABEL_COLORS } from "../../utils/constants";
import { colorIndexForLabel } from "../core/boxes";

/** A label in its box colour; clickable to edit. */
export const LabelChip: React.FC<{ label: string; onClick?: () => void; title?: string }> = ({ label, onClick, title }) => (
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    title={title ?? "Click to type a label"}
    className="px-1.5 py-0.5 rounded text-white text-xs font-semibold min-w-[1.5rem] hover:opacity-80"
    style={{ background: LABEL_COLORS[colorIndexForLabel(label)].stroke }}
  >
    {label}
  </button>
);
