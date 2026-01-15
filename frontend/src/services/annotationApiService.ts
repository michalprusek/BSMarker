/**
 * Centralized API service for annotation operations
 * Provides consistent error handling, retry logic, and response processing
 */

import api, { annotationService, recordingService } from "./api";
import { notification, Messages } from "../lib/notifications";
import { BoundingBox, Recording } from "../types";

export interface SaveAnnotationOptions {
  showNotification?: boolean;
  retryCount?: number;
  retryDelay?: number;
}

export interface LoadRecordingOptions {
  includeSpectrogram?: boolean;
  showNotification?: boolean;
}

class AnnotationApiService {
  private saveInProgress = false;
  private lastSaveTime: Date | null = null;

  /**
   * Save annotations with retry logic
   */
  async saveAnnotations(
    annotationId: number,
    boundingBoxes: BoundingBox[],
    options: SaveAnnotationOptions = {},
  ): Promise<{ success: boolean; timestamp: Date }> {
    const {
      showNotification = true,
      retryCount = 3,
      retryDelay = 1000,
    } = options;

    if (this.saveInProgress) {
      if (showNotification) {
        notification.warning("Save already in progress");
      }
      return { success: false, timestamp: new Date() };
    }

    this.saveInProgress = true;

    try {
      let lastError: any;

      for (let attempt = 0; attempt < retryCount; attempt++) {
        try {
          await annotationService.updateAnnotation(annotationId, {
            bounding_boxes: boundingBoxes,
          });

          this.lastSaveTime = new Date();

          if (showNotification) {
            notification.success(Messages.ANNOTATION.SAVE_SUCCESS);
          }

          return { success: true, timestamp: this.lastSaveTime };
        } catch (error) {
          lastError = error;

          if (attempt < retryCount - 1) {
            await this.delay(retryDelay * (attempt + 1));
          }
        }
      }

      // All retries failed
      throw lastError;
    } catch (error) {
      console.error("Failed to save annotations:", error);

      if (showNotification) {
        const errorMessage = this.getErrorMessage(error);
        notification.error(errorMessage);
      }

      return { success: false, timestamp: new Date() };
    } finally {
      this.saveInProgress = false;
    }
  }

  /**
   * Load recording data with error handling
   */
  async loadRecording(
    recordingId: number,
    options: LoadRecordingOptions = {},
  ): Promise<{
    recording: Recording | null;
    annotations: BoundingBox[];
    error: string | null;
  }> {
    const { showNotification = true } = options;

    try {
      const recording = await recordingService.getRecording(recordingId);

      if (!recording) {
        const errorMsg = Messages.RECORDING.NOT_FOUND;
        if (showNotification) {
          notification.error(errorMsg);
        }
        return { recording: null, annotations: [], error: errorMsg };
      }

      // Note: Annotations are loaded separately via annotationService
      let annotations: BoundingBox[] = [];

      if (showNotification) {
        notification.success(Messages.RECORDING.LOADED);
      }

      return { recording, annotations, error: null };
    } catch (error) {
      console.error("Failed to load recording:", error);

      const errorMsg = this.getErrorMessage(error);
      if (showNotification) {
        notification.error(errorMsg);
      }

      return { recording: null, annotations: [], error: errorMsg };
    }
  }

  /**
   * Load spectrogram with status polling
   */
  async loadSpectrogram(
    recordingId: number,
    onStatusUpdate?: (status: string) => void,
  ): Promise<{
    url: string | null;
    error: string | null;
  }> {
    try {
      const maxAttempts = 60;
      const pollInterval = 2000;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const recording = await recordingService.getRecording(recordingId);

        if (!recording) {
          throw new Error("Recording not found");
        }

        // Note: Spectrogram status would need to be added to Recording type
        // For now, we'll check if there's a spectrogram URL in the response
        const spectrogramUrl = (recording as any).spectrogram_url;
        const status = (recording as any).spectrogram_status || "pending";
        onStatusUpdate?.(status);

        if (status === "completed" && spectrogramUrl) {
          notification.success(Messages.RECORDING.SPECTROGRAM_LOADED);
          return { url: spectrogramUrl, error: null };
        }

        if (status === "failed") {
          throw new Error("Spectrogram generation failed");
        }

        if (status === "processing" && attempt === 0) {
          notification.info(Messages.RECORDING.SPECTROGRAM_PROCESSING);
        }

        await this.delay(pollInterval);
      }

      throw new Error("Spectrogram generation timeout");
    } catch (error) {
      console.error("Failed to load spectrogram:", error);

      const errorMsg = this.getErrorMessage(error);
      notification.error(errorMsg);

      return { url: null, error: errorMsg };
    }
  }

  /**
   * Generate spectrogram for a recording
   */
  async generateSpectrogram(recordingId: number): Promise<boolean> {
    try {
      notification.info(Messages.RECORDING.SPECTROGRAM_GENERATING);

      // Note: Need to add generateSpectrogram endpoint to recordingService
      // For now, we'll use the updateStatus endpoint or similar
      await api.post(`/recordings/${recordingId}/generate-spectrogram`);

      return true;
    } catch (error) {
      console.error("Failed to generate spectrogram:", error);

      const errorMsg = this.getErrorMessage(error);
      notification.error(errorMsg);

      return false;
    }
  }

  /**
   * Load project recordings for navigation
   */
  async loadProjectRecordings(
    projectId: number,
    options: { showNotification?: boolean } = {},
  ): Promise<{
    recordings: Recording[];
    error: string | null;
  }> {
    const { showNotification = true } = options;

    try {
      const recordingsResponse =
        await recordingService.getRecordings(projectId);
      const recordings = Array.isArray(recordingsResponse)
        ? recordingsResponse
        : recordingsResponse.items || [];
      return { recordings, error: null };
    } catch (error) {
      console.error("Failed to load project recordings:", error);

      const errorMsg = this.getErrorMessage(error);

      // Show notification to inform user about the failure
      if (showNotification) {
        notification.error(errorMsg);
      }

      return { recordings: [], error: errorMsg };
    }
  }

  /**
   * Delete bounding boxes
   *
   * NOTE: This method is not implemented. Use saveAnnotations() with filtered boxes instead.
   * The backend does not have a dedicated endpoint for batch box deletion.
   *
   * @throws Error always - method not implemented
   * @deprecated Use saveAnnotations with filtered bounding_boxes array instead
   */
  async deleteBoundingBoxes(
    _annotationId: number,
    _boxIds: number[],
    _options: { showNotification?: boolean } = {},
  ): Promise<boolean> {
    throw new Error(
      "deleteBoundingBoxes is not implemented. Use saveAnnotations() with filtered boxes instead."
    );
  }

  /**
   * Update bounding box label
   *
   * NOTE: This method is not implemented. Use saveAnnotations() with updated boxes instead.
   * The backend does not have a dedicated endpoint for single box updates.
   *
   * @throws Error always - method not implemented
   * @deprecated Use saveAnnotations with updated bounding_boxes array instead
   */
  async updateBoundingBoxLabel(
    _annotationId: number,
    _boxId: number,
    _label: string,
    _options: { showNotification?: boolean } = {},
  ): Promise<boolean> {
    throw new Error(
      "updateBoundingBoxLabel is not implemented. Use saveAnnotations() with updated boxes instead."
    );
  }

  /**
   * Get the last save time
   */
  getLastSaveTime(): Date | null {
    return this.lastSaveTime;
  }

  /**
   * Check if save is in progress
   */
  isSaving(): boolean {
    return this.saveInProgress;
  }

  /**
   * Helper to extract error message
   */
  private getErrorMessage(error: any): string {
    if (error.response?.data?.detail) {
      return error.response.data.detail;
    }

    if (error.message) {
      return error.message;
    }

    if (error.response?.status === 403) {
      return Messages.AUTH.UNAUTHORIZED;
    }

    if (error.response?.status === 401) {
      return Messages.AUTH.SESSION_EXPIRED;
    }

    if (error.code === "ECONNABORTED" || error.code === "ERR_NETWORK") {
      return Messages.GENERAL.NETWORK_ERROR;
    }

    return Messages.GENERAL.UNKNOWN_ERROR;
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const annotationApiService = new AnnotationApiService();

export default annotationApiService;
