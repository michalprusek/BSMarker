/**
 * Conflict Warning Modal
 *
 * Displays when user attempts to navigate away from annotation editor
 * with unresolved bounding box conflicts.
 */

import React from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import {
  UnifiedConflict,
  formatUnifiedConflictDescription,
} from "../utils/conflictDetection";
import BaseModal, { ModalBody, ModalFooter } from "./shared/BaseModal";

interface ConflictWarningModalProps {
  /**
   * Whether modal is visible
   */
  isOpen: boolean;

  /**
   * Array of detected conflicts (gap and nesting)
   */
  conflicts: UnifiedConflict[];

  /**
   * Callback to auto-resolve conflicts and continue navigation
   */
  onResolveAndContinue: () => void;

  /**
   * Callback to stay on page and fix conflicts manually
   */
  onStayAndFix: () => void;

  /**
   * Callback to discard conflicts and continue navigation anyway (unsafe)
   */
  onDiscardAndContinue: () => void;
}

/**
 * Modal component that warns users about unresolved conflicts
 * when attempting to navigate away from the annotation editor.
 *
 * Provides three options:
 * 1. Auto-resolve conflicts and continue
 * 2. Stay and fix manually
 * 3. Discard and continue (unsafe)
 */
export const ConflictWarningModal: React.FC<ConflictWarningModalProps> = ({
  isOpen,
  conflicts,
  onResolveAndContinue,
  onStayAndFix,
  onDiscardAndContinue,
}) => {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onStayAndFix}
      title="Unresolved Conflicts Detected"
      description={`${conflicts.length} bounding box conflict${
        conflicts.length > 1 ? "s" : ""
      } must be resolved before leaving`}
      size="lg"
      closeOnOverlayClick={false}
      showCloseButton={true}
    >
      <ModalBody>
        {/* Warning Icon */}
        <div className="flex items-center gap-3 mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <ExclamationTriangleIcon className="h-6 w-6 text-orange-600 flex-shrink-0" />
          <p className="text-sm text-orange-800">
            Bounding boxes must have at least{" "}
            <strong>10 milliseconds gap</strong> between them and cannot be nested.
            Please resolve conflicts before saving or leaving.
          </p>
        </div>

        {/* Conflict List */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          <h4 className="font-semibold text-sm text-gray-700 mb-2">
            Detected Conflicts:
          </h4>
          {conflicts.map((conflict, index) => (
            <div
              key={index}
              className="text-sm text-gray-600 p-2 bg-gray-50 rounded border border-gray-200"
            >
              <div className="font-medium text-gray-700 mb-1">
                Conflict #{index + 1}
              </div>
              <div className="text-xs text-gray-500">
                {formatUnifiedConflictDescription(conflict)}
              </div>
              {conflict.type === 'gap' && conflict.overlapAmount !== undefined && (
                <div className="text-xs text-orange-600 mt-1">
                  Gap: {(conflict.overlapAmount * 1000).toFixed(1)}ms (needs{" "}
                  {(10 - conflict.overlapAmount * 1000).toFixed(1)}ms more)
                </div>
              )}
              {conflict.type === 'nesting' && (
                <div className="text-xs text-purple-600 mt-1">
                  Nested box will be removed
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Resolution Info */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Auto-Resolve</strong> will automatically remove nested boxes
            and adjust overlapping boxes to create a 12ms gap (exceeding the minimum
            10ms requirement).
          </p>
        </div>
      </ModalBody>

      <ModalFooter>
        {/* Stay and Fix Manually */}
        <button
          onClick={onStayAndFix}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Stay & Fix Manually
        </button>

        {/* Auto-Resolve and Continue */}
        <button
          onClick={onResolveAndContinue}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Auto-Resolve & Continue
        </button>

        {/* Discard and Continue (Unsafe) */}
        <button
          onClick={onDiscardAndContinue}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          title="This will leave with unresolved conflicts (not recommended)"
        >
          Discard & Continue
        </button>
      </ModalFooter>
    </BaseModal>
  );
};

export default ConflictWarningModal;
