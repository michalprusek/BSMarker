/**
 * File utility functions for BSMarker
 * Provides consistent file handling across the application
 */

import { logger } from "./logger";

export interface FileValidationOptions {
  maxSizeInMB?: number;
  acceptedTypes?: string[];
  acceptedExtensions?: string[];
}

export interface FileInfo {
  name: string;
  size: number;
  sizeFormatted: string;
  type: string;
  extension: string;
  lastModified: Date;
}

/**
 * Format file size in human-readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

/**
 * Get file extension from filename
 */
export const getFileExtension = (filename: string): string => {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
};

/**
 * Validate file against specified criteria
 */
export const validateFile = (
  file: File,
  options: FileValidationOptions = {},
): { valid: boolean; error?: string } => {
  const {
    maxSizeInMB = 100,
    acceptedTypes = [],
    acceptedExtensions = [],
  } = options;

  // Check file size
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  if (file.size > maxSizeInBytes) {
    const error = `File size (${formatFileSize(file.size)}) exceeds ${maxSizeInMB}MB limit`;
    logger.warn(error, "FileUtils", { filename: file.name, size: file.size });
    return { valid: false, error };
  }

  // Check file type
  if (acceptedTypes.length > 0 && !acceptedTypes.includes(file.type)) {
    const error = `File type (${file.type}) not accepted. Accepted types: ${acceptedTypes.join(", ")}`;
    logger.warn(error, "FileUtils", { filename: file.name, type: file.type });
    return { valid: false, error };
  }

  // Check file extension
  const extension = getFileExtension(file.name);
  if (
    acceptedExtensions.length > 0 &&
    !acceptedExtensions.includes(extension)
  ) {
    const error = `File extension (.${extension}) not accepted. Accepted extensions: ${acceptedExtensions.map((e) => `.${e}`).join(", ")}`;
    logger.warn(error, "FileUtils", { filename: file.name, extension });
    return { valid: false, error };
  }

  logger.debug(`File validated successfully: ${file.name}`, "FileUtils");
  return { valid: true };
};

/**
 * Get detailed file information
 */
export const getFileInfo = (file: File): FileInfo => {
  return {
    name: file.name,
    size: file.size,
    sizeFormatted: formatFileSize(file.size),
    type: file.type || "unknown",
    extension: getFileExtension(file.name),
    lastModified: new Date(file.lastModified),
  };
};

/**
 * Read file as text
 */
export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === "string") {
        logger.debug(`Read file as text: ${file.name}`, "FileUtils");
        resolve(result);
      } else {
        reject(new Error("Failed to read file as text"));
      }
    };

    reader.onerror = (error) => {
      logger.error(
        `Failed to read file: ${file.name}`,
        "FileUtils",
        error as any,
      );
      reject(error);
    };

    reader.readAsText(file);
  });
};

/**
 * Read file as data URL
 */
export const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === "string") {
        logger.debug(`Read file as data URL: ${file.name}`, "FileUtils");
        resolve(result);
      } else {
        reject(new Error("Failed to read file as data URL"));
      }
    };

    reader.onerror = (error) => {
      logger.error(
        `Failed to read file: ${file.name}`,
        "FileUtils",
        error as any,
      );
      reject(error);
    };

    reader.readAsDataURL(file);
  });
};

/**
 * Read file as array buffer
 */
export const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const result = event.target?.result;
      if (result instanceof ArrayBuffer) {
        logger.debug(`Read file as array buffer: ${file.name}`, "FileUtils");
        resolve(result);
      } else {
        reject(new Error("Failed to read file as array buffer"));
      }
    };

    reader.onerror = (error) => {
      logger.error(
        `Failed to read file: ${file.name}`,
        "FileUtils",
        error as any,
      );
      reject(error);
    };

    reader.readAsArrayBuffer(file);
  });
};

/**
 * Create a file from blob
 */
export const createFileFromBlob = (
  blob: Blob,
  filename: string,
  type?: string,
): File => {
  const file = new File([blob], filename, {
    type: type || blob.type,
    lastModified: Date.now(),
  });

  logger.debug(`Created file from blob: ${filename}`, "FileUtils");
  return file;
};

/**
 * Download file to user's computer
 */
export const downloadFile = (
  content: BlobPart,
  filename: string,
  type: string = "application/octet-stream",
): void => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  logger.info(`Downloaded file: ${filename}`, "FileUtils");
};

/**
 * Export data as JSON file
 */
export const exportAsJSON = (data: any, filename: string): void => {
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, filename, "application/json");
};

/**
 * Export data as CSV file
 */
export const exportAsCSV = (
  data: Record<string, any>[],
  filename: string,
  headers?: string[],
): void => {
  if (data.length === 0) {
    logger.warn("No data to export as CSV", "FileUtils");
    return;
  }

  // Get headers from first object if not provided
  const csvHeaders = headers || Object.keys(data[0]);

  // Create CSV content
  const csvRows = [
    csvHeaders.join(","),
    ...data.map((row) =>
      csvHeaders
        .map((header) => {
          const value = row[header];
          // Escape values containing commas or quotes
          if (
            typeof value === "string" &&
            (value.includes(",") || value.includes('"'))
          ) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value ?? "";
        })
        .join(","),
    ),
  ];

  const csv = csvRows.join("\n");
  downloadFile(csv, filename, "text/csv");
};

/**
 * Batch validate multiple files
 */
export const validateFiles = (
  files: FileList | File[],
  options: FileValidationOptions = {},
): { valid: File[]; invalid: { file: File; error: string }[] } => {
  const valid: File[] = [];
  const invalid: { file: File; error: string }[] = [];

  Array.from(files).forEach((file) => {
    const validation = validateFile(file, options);
    if (validation.valid) {
      valid.push(file);
    } else {
      invalid.push({ file, error: validation.error || "Unknown error" });
    }
  });

  logger.info(
    `Validated ${files.length} files: ${valid.length} valid, ${invalid.length} invalid`,
    "FileUtils",
  );

  return { valid, invalid };
};
