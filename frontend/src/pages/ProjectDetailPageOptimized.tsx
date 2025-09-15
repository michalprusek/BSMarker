import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Project, Recording } from "../types";
import { PaginatedResponse, PaginationMetadata } from "../types/pagination";
import {
  projectService,
  recordingService,
  annotationService,
} from "../services/api";
import toast from "react-hot-toast";
import { VirtualizedRecordingList } from "../components/VirtualizedRecordingList";
import UploadRecordingModal from "../components/UploadRecordingModal";
import {
  FunnelIcon,
  PlusIcon,
  TrashIcon,
  CloudArrowDownIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

const ProjectDetailPageOptimized: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // State management
  const [project, setProject] = useState<Project | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [pagination, setPagination] = useState<PaginationMetadata>({
    total: 0,
    page: 1,
    page_size: 50,
    total_pages: 0,
    has_next: false,
    has_prev: false,
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedRecordings, setSelectedRecordings] = useState<Set<number>>(
    new Set(),
  );

  // Filters and search
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [minDuration, setMinDuration] = useState("");
  const [maxDuration, setMaxDuration] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [annotationStatus, setAnnotationStatus] = useState<
    "all" | "annotated" | "unannotated"
  >("all");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingFull, setIsDownloadingFull] = useState(false);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch project data
  const fetchProjectData = useCallback(
    async (page: number = 1, append: boolean = false) => {
      if (!projectId) return;

      try {
        if (!append) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }

        // Fetch project info if not loaded
        if (!project) {
          const projectData = await projectService.getProject(
            parseInt(projectId),
          );
          setProject(projectData);
        }

        // Build query parameters
        const params: any = {
          skip: (page - 1) * 50,
          limit: 50,
          sort_by: sortBy,
          sort_order: sortOrder,
        };

        if (debouncedSearchTerm) params.search = debouncedSearchTerm;
        if (minDuration) params.min_duration = parseFloat(minDuration);
        if (maxDuration) params.max_duration = parseFloat(maxDuration);
        if (annotationStatus !== "all")
          params.annotation_status = annotationStatus;

        // Fetch recordings with pagination
        const response: PaginatedResponse<Recording> =
          await recordingService.getRecordings(parseInt(projectId), params);

        if (append) {
          // Append to existing recordings for infinite scroll
          setRecordings((prev) => [...prev, ...response.items]);
        } else {
          // Replace recordings for new search/filter
          setRecordings(response.items);
        }

        setPagination(response.pagination);
      } catch (error) {
        console.error("Failed to fetch project data:", error);
        toast.error("Failed to fetch project data");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      projectId,
      project,
      debouncedSearchTerm,
      minDuration,
      maxDuration,
      annotationStatus,
      sortBy,
      sortOrder,
    ],
  );

  // Initial load and filter changes
  useEffect(() => {
    fetchProjectData(1, false);
  }, [fetchProjectData]);

  // Handle infinite scroll
  const handleLoadMore = useCallback(
    async (page: number) => {
      if (!loadingMore && pagination.has_next) {
        await fetchProjectData(page, true);
      }
    },
    [fetchProjectData, loadingMore, pagination.has_next],
  );

  // Handle recording selection
  const handleSelectRecording = useCallback((id: number) => {
    setSelectedRecordings((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  // Handle select all
  const handleToggleSelectAll = useCallback(() => {
    if (
      selectedRecordings.size === recordings.length &&
      recordings.length > 0
    ) {
      setSelectedRecordings(new Set());
    } else {
      setSelectedRecordings(new Set(recordings.map((r) => r.id)));
    }
  }, [recordings, selectedRecordings.size]);

  // Handle upload success
  const handleRecordingUploaded = useCallback(() => {
    setShowUploadModal(false);
    fetchProjectData(1, false);
    toast.success("Recording uploaded successfully");
  }, [fetchProjectData]);

  // Handle bulk delete
  const handleBulkDelete = useCallback(async () => {
    if (selectedRecordings.size === 0) return;

    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedRecordings.size} recordings?`,
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      await recordingService.bulkDeleteRecordings(
        parseInt(projectId!),
        Array.from(selectedRecordings),
      );
      toast.success(`Deleted ${selectedRecordings.size} recordings`);
      setSelectedRecordings(new Set());
      fetchProjectData(1, false);
    } catch (error) {
      console.error("Failed to delete recordings:", error);
      toast.error("Failed to delete recordings");
    } finally {
      setIsDeleting(false);
    }
  }, [selectedRecordings, projectId, fetchProjectData]);

  // Handle download annotations
  const handleDownloadAnnotations = useCallback(async () => {
    if (!projectId) return;

    setIsDownloading(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      // Fetch all annotations for the project
      const allRecordings = recordings.filter(
        (r) => r.annotation_count && r.annotation_count > 0,
      );

      for (const recording of allRecordings) {
        try {
          const annotations = await annotationService.getAnnotations(
            recording.id,
          );
          if (annotations.length > 0) {
            const annotationData = {
              recording_id: recording.id,
              filename: recording.original_filename,
              annotations: annotations,
            };
            zip.file(
              `${recording.original_filename}_annotations.json`,
              JSON.stringify(annotationData, null, 2),
            );
          }
        } catch (error) {
          console.error(
            `Failed to fetch annotations for recording ${recording.id}:`,
            error,
          );
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project_${projectId}_annotations.zip`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Annotations downloaded successfully");
    } catch (error) {
      console.error("Failed to download annotations:", error);
      toast.error("Failed to download annotations");
    } finally {
      setIsDownloading(false);
    }
  }, [projectId, recordings]);

  // Comprehensive download with all components
  const handleDownloadAll = useCallback(async () => {
    if (!projectId || recordings.length === 0) return;

    setIsDownloadingFull(true);

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      // Create folders
      const recordingsFolder = zip.folder("recordings");
      const spectrogramsFolder = zip.folder("spectrograms");
      const annotationsFolder = zip.folder("annotations");
      const visualizationsFolder = zip.folder("visualizations");

      // Process each recording
      for (const recording of recordings) {
        try {
          // 1. Download original recording audio file
          try {
            const audioBlob = await recordingService.downloadRecording(
              recording.id,
            );
            if (recordingsFolder) {
              recordingsFolder.file(
                `${recording.original_filename}`,
                audioBlob,
              );
            }
          } catch (audioError) {
            console.warn(
              `Audio not available for ${recording.original_filename}`,
            );
          }

          // 2. Download spectrogram
          try {
            const spectrogramBlob = await recordingService.getSpectrogramBlob(
              recording.id,
            );
            if (spectrogramBlob && spectrogramsFolder) {
              spectrogramsFolder.file(
                `${recording.original_filename.replace(/\.[^/.]+$/, "")}_spectrogram.png`,
                spectrogramBlob,
              );
            }
          } catch (spectrogramError) {
            console.warn(
              `Spectrogram not available for ${recording.original_filename}`,
            );
          }

          // 3. Get annotations
          const annotations = await annotationService.getAnnotations(
            recording.id,
          );

          // Save annotations as JSON
          if (annotationsFolder && annotations && annotations.length > 0) {
            // Use the LATEST annotation (last in array)
            const latestAnnotation = annotations[annotations.length - 1];
            const annotationData = {
              recording: {
                id: recording.id,
                filename: recording.original_filename,
                duration: recording.duration,
                sample_rate: recording.sample_rate,
              },
              annotations: latestAnnotation.bounding_boxes.map((box: any) => ({
                label: box.label || "None",
                start_time: box.start_time,
                end_time: box.end_time,
                min_frequency: box.min_frequency,
                max_frequency: box.max_frequency,
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
              })),
            };

            const jsonStr = JSON.stringify(annotationData, null, 2);
            annotationsFolder.file(
              `${recording.original_filename.replace(/\.[^/.]+$/, "")}_annotations.json`,
              jsonStr,
            );

            // 4. Generate visualization with bounding boxes
            try {
              // First get the spectrogram as a blob
              const spectrogramBlob = await recordingService.getSpectrogramBlob(
                recording.id,
              );

              if (
                spectrogramBlob &&
                visualizationsFolder &&
                latestAnnotation.bounding_boxes.length > 0
              ) {
                // Create object URL from blob for visualization
                const spectrogramUrl = URL.createObjectURL(spectrogramBlob);

                try {
                  const visualizationBlob = await generateVisualization(
                    spectrogramUrl,
                    latestAnnotation.bounding_boxes,
                    recording,
                  );
                  visualizationsFolder.file(
                    `${recording.original_filename.replace(/\.[^/.]+$/, "")}_annotated.png`,
                    visualizationBlob,
                  );
                } catch (err) {
                  console.error(
                    "Failed to generate visualization for",
                    recording.original_filename,
                    err,
                  );
                } finally {
                  // Clean up the object URL
                  URL.revokeObjectURL(spectrogramUrl);
                }
              }
            } catch (err) {
              console.warn("Could not get spectrogram for visualization:", err);
            }
          }
        } catch (err) {
          console.error(
            `Failed to process recording ${recording.original_filename}:`,
            err,
          );
          toast.error(`Failed to process ${recording.original_filename}`);
        }
      }

      // 5. Generate project summary metadata
      const summary = {
        project: {
          id: project?.id,
          name: project?.name,
          description: project?.description,
          created_at: project?.created_at,
        },
        recordings_count: recordings.length,
        total_duration: recordings.reduce(
          (sum, r) => sum + (r.duration || 0),
          0,
        ),
        export_date: new Date().toISOString(),
      };

      zip.file("project_summary.json", JSON.stringify(summary, null, 2));

      // Generate and download zip
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.name.replace(/[^a-z0-9]/gi, "_")}_full_export_${new Date().toISOString().split("T")[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Full project exported successfully");
    } catch (error) {
      console.error("Failed to export project:", error);
      toast.error("Failed to export project");
    } finally {
      setIsDownloadingFull(false);
    }
  }, [projectId, project, recordings]);

  // Visualization generation helper function
  const generateVisualization = async (
    spectrogramUrl: string,
    boundingBoxes: any[],
    recording: Recording,
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Remove crossOrigin since we're using blob URLs
      // img.crossOrigin = "anonymous";

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Draw spectrogram
        ctx.drawImage(img, 0, 0);

        // Define colors for different labels
        const labelColors: Record<string, string> = {
          None: "rgba(107, 114, 128, 0.5)",
          A: "rgba(239, 68, 68, 0.5)",
          B: "rgba(245, 158, 11, 0.5)",
          C: "rgba(16, 185, 129, 0.5)",
          D: "rgba(59, 130, 246, 0.5)",
          E: "rgba(139, 92, 246, 0.5)",
        };

        // Draw bounding boxes
        boundingBoxes.forEach((box) => {
          let xStart, boxWidth, yTop, boxHeight;

          // Calculate positions based on coordinate system
          if (
            recording.duration &&
            box.start_time !== undefined &&
            box.end_time !== undefined
          ) {
            // Time-based coordinates
            xStart = (box.start_time / recording.duration) * img.width;
            const xEnd = (box.end_time / recording.duration) * img.width;
            boxWidth = Math.max(1, xEnd - xStart);

            // Calculate y position based on frequency
            const maxFreq = (recording.sample_rate || 44100) / 2;

            if (
              box.max_frequency !== undefined &&
              box.min_frequency !== undefined
            ) {
              // Frequency-based coordinates (Y-axis is inverted in spectrograms)
              yTop = img.height - (box.max_frequency / maxFreq) * img.height;
              const yBottom =
                img.height - (box.min_frequency / maxFreq) * img.height;
              boxHeight = Math.max(1, yBottom - yTop);
            } else if (box.y !== undefined && box.height !== undefined) {
              // Fallback to pixel coordinates with scaling
              const scaleY = img.height / 400;
              yTop = box.y * scaleY;
              boxHeight = Math.max(1, box.height * scaleY);
            } else {
              yTop = 0;
              boxHeight = img.height;
            }
          } else if (
            box.x !== undefined &&
            box.width !== undefined &&
            box.y !== undefined &&
            box.height !== undefined
          ) {
            // Pure pixel coordinates with scaling
            const scaleX = img.width / 800;
            const scaleY = img.height / 400;
            xStart = box.x * scaleX;
            boxWidth = Math.max(1, box.width * scaleX);
            yTop = box.y * scaleY;
            boxHeight = Math.max(1, box.height * scaleY);
          } else {
            return; // Skip boxes with insufficient data
          }

          // Get color for label
          const color = labelColors[box.label] || "rgba(59, 130, 246, 0.5)";

          // Draw box
          try {
            ctx.strokeStyle = color.replace("0.5", "1");
            ctx.lineWidth = 2;
            ctx.strokeRect(xStart, yTop, boxWidth, boxHeight);

            // Fill with semi-transparent color
            ctx.fillStyle = color;
            ctx.fillRect(xStart, yTop, boxWidth, boxHeight);

            // Draw label
            if (box.label && box.label !== "None") {
              ctx.font = "bold 14px Arial";
              ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
              const labelWidth = ctx.measureText(box.label).width + 8;
              ctx.fillRect(xStart, yTop, labelWidth, 20);
              ctx.fillStyle = "white";
              ctx.fillText(box.label, xStart + 4, yTop + 14);
            }
          } catch (err) {
            console.error("Error drawing box:", err);
          }
        });

        // Convert canvas to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to convert canvas to blob"));
            }
          },
          "image/png",
          1.0,
        );
      };

      img.onerror = (error) => {
        console.error("Image load error:", error);
        reject(new Error("Failed to load spectrogram image"));
      };

      img.src = spectrogramUrl;
    });
  };

  // Calculate stats
  const stats = useMemo(() => {
    const annotatedCount = recordings.filter(
      (r) => r.annotation_count && r.annotation_count > 0,
    ).length;
    // Use total_duration from pagination if available, otherwise calculate from current page
    const totalDuration =
      pagination.total_duration ||
      recordings.reduce((sum, r) => sum + (r.duration || 0), 0);

    return {
      totalRecordings: pagination.total,
      annotatedRecordings: annotatedCount,
      totalDuration: Math.round(totalDuration / 60), // in minutes
      annotationProgress:
        pagination.total > 0
          ? Math.round((annotatedCount / pagination.total) * 100)
          : 0,
    };
  }, [recordings, pagination.total, pagination.total_duration]);

  if (loading && recordings.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate("/projects")}
          className="text-gray-600 hover:text-gray-900 mb-4 inline-flex items-center"
        >
          ← Back to Projects
        </button>

        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {project?.name || "Loading..."}
          </h1>
          {project?.description && (
            <p className="text-gray-600 mb-4">{project.description}</p>
          )}

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-4">
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-600">Total Recordings</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats.totalRecordings}
              </p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-600">Annotated</p>
              <p className="text-2xl font-semibold text-green-600">
                {stats.annotatedRecordings}
              </p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-600">Total Duration</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats.totalDuration} min
              </p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-600">Progress</p>
              <div className="mt-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{ width: `${stats.annotationProgress}%` }}
                  />
                </div>
                <p className="text-sm mt-1">{stats.annotationProgress}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[300px]">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search recordings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Actions */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center"
          >
            <FunnelIcon className="h-5 w-5 mr-2" />
            Filters
          </button>

          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Upload Recording
          </button>

          {selectedRecordings.size > 0 && (
            <>
              <button
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center"
              >
                <TrashIcon className="h-5 w-5 mr-2" />
                Delete Selected ({selectedRecordings.size})
              </button>
            </>
          )}

          <button
            onClick={handleDownloadAnnotations}
            disabled={isDownloading || stats.annotatedRecordings === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center"
          >
            <CloudArrowDownIcon className="h-5 w-5 mr-2" />
            {isDownloading ? "Downloading..." : "Download Annotations"}
          </button>

          <button
            onClick={handleDownloadAll}
            disabled={isDownloadingFull || recordings.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            <CloudArrowDownIcon className="h-5 w-5 mr-2" />
            {isDownloadingFull ? "Exporting..." : "Download All"}
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={annotationStatus}
                onChange={(e) => setAnnotationStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="annotated">Annotated</option>
                <option value="unannotated">Unannotated</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min Duration (s)
              </label>
              <input
                type="number"
                value={minDuration}
                onChange={(e) => setMinDuration(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Duration (s)
              </label>
              <input
                type="number"
                value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Any"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="created_at">Date Created</option>
                <option value="filename">Filename</option>
                <option value="duration">Duration</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Order
              </label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Virtualized Recording List */}
      <VirtualizedRecordingList
        recordings={recordings}
        pagination={pagination}
        selectedRecordings={selectedRecordings}
        onSelectRecording={handleSelectRecording}
        onToggleSelectAll={handleToggleSelectAll}
        onLoadMore={handleLoadMore}
        isLoadingMore={loadingMore}
        height={600}
      />

      {/* Upload Modal */}
      {showUploadModal && projectId && (
        <UploadRecordingModal
          projectId={parseInt(projectId)}
          onClose={() => setShowUploadModal(false)}
          onUploaded={handleRecordingUploaded}
        />
      )}
    </div>
  );
};

export default ProjectDetailPageOptimized;
