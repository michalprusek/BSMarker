import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Project, Recording } from "../types";
import { PaginatedResponse, PaginationMetadata } from "../types/pagination";
import {
  projectService,
  recordingService,
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
    "all" | "annotated" | "unannotated" | "finished"
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

  // Auto-polling for spectrogram generation progress
  useEffect(() => {
    const spectrogramGenerating = pagination.spectrogram_generating_count ?? 0;
    const spectrogramQueued = pagination.spectrogram_queued_count ?? 0;
    const shouldPoll = (spectrogramGenerating > 0) || (spectrogramQueued > 0);

    if (!shouldPoll) {
      return; // No polling needed
    }

    const pollInterval = setInterval(() => {
      // Poll without showing loading indicator
      fetchProjectData(pagination.page, false);
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(pollInterval);
  }, [pagination.spectrogram_generating_count, pagination.spectrogram_queued_count, pagination.page, fetchProjectData]);

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

  // Helper to check if filters are active
  const hasActiveFilters = useCallback(() => {
    return !!(
      debouncedSearchTerm ||
      minDuration ||
      maxDuration ||
      annotationStatus !== "all"
    );
  }, [debouncedSearchTerm, minDuration, maxDuration, annotationStatus]);

  // Helper to build filter params
  const getFilterParams = useCallback(() => {
    const filters: any = {};
    if (debouncedSearchTerm) filters.search = debouncedSearchTerm;
    if (minDuration) filters.min_duration = parseFloat(minDuration);
    if (maxDuration) filters.max_duration = parseFloat(maxDuration);
    if (annotationStatus !== "all")
      filters.annotation_status = annotationStatus;
    return filters;
  }, [debouncedSearchTerm, minDuration, maxDuration, annotationStatus]);

  // Handle download annotations
  const handleDownloadAnnotations = useCallback(async () => {
    if (!projectId) return;

    // Warn user if filters are active
    if (hasActiveFilters()) {
      const filterDescription = [];
      if (debouncedSearchTerm)
        filterDescription.push(`Search: "${debouncedSearchTerm}"`);
      if (minDuration) filterDescription.push(`Min duration: ${minDuration}s`);
      if (maxDuration) filterDescription.push(`Max duration: ${maxDuration}s`);
      if (annotationStatus !== "all")
        filterDescription.push(`Status: ${annotationStatus}`);

      const confirmed = window.confirm(
        `Active filters will be applied to the export:\n\n${filterDescription.join("\n")}\n\nOnly recordings matching these filters will be exported.\n\nDo you want to continue?`,
      );
      if (!confirmed) return;
    }

    setIsDownloading(true);
    try {
      // Use the new bulk export endpoint
      const blob = await projectService.exportAnnotations(
        parseInt(projectId),
        getFilterParams(),
      );

      // Download the ZIP file
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project_${projectId}_annotations.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Annotations downloaded successfully");
    } catch (error) {
      console.error("Failed to download annotations:", error);
      toast.error("Failed to download annotations");
    } finally {
      setIsDownloading(false);
    }
  }, [
    projectId,
    hasActiveFilters,
    getFilterParams,
    debouncedSearchTerm,
    minDuration,
    maxDuration,
    annotationStatus,
  ]);

  // Comprehensive download with all components
  const handleDownloadAll = useCallback(async () => {
    if (!projectId) return;

    // Warn user if filters are active
    if (hasActiveFilters()) {
      const filterDescription = [];
      if (debouncedSearchTerm)
        filterDescription.push(`Search: "${debouncedSearchTerm}"`);
      if (minDuration) filterDescription.push(`Min duration: ${minDuration}s`);
      if (maxDuration) filterDescription.push(`Max duration: ${maxDuration}s`);
      if (annotationStatus !== "all")
        filterDescription.push(`Status: ${annotationStatus}`);

      const confirmed = window.confirm(
        `Active filters will be applied to the export:\n\n${filterDescription.join("\n")}\n\nOnly recordings matching these filters will be exported.\n\nDo you want to continue?`,
      );
      if (!confirmed) return;
    }

    setIsDownloadingFull(true);

    try {
      // Use the new bulk export endpoint for full export
      const blob = await projectService.exportFull(
        parseInt(projectId),
        getFilterParams(),
      );

      // Download the ZIP file
      const url = URL.createObjectURL(blob);
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
  }, [
    projectId,
    project,
    hasActiveFilters,
    getFilterParams,
    debouncedSearchTerm,
    minDuration,
    maxDuration,
    annotationStatus,
  ]);

  // Calculate stats
  const stats = useMemo(() => {
    // Use counts from pagination metadata (backend calculates these for all recordings)
    const finishedCount = pagination.finished_count ?? 0;
    const annotatedCount = pagination.annotated_count ?? 0;
    const totalDuration = pagination.total_duration ?? 0;
    const spectrogramReady = pagination.spectrogram_ready_count ?? 0;
    const spectrogramGenerating = pagination.spectrogram_generating_count ?? 0;
    const spectrogramQueued = pagination.spectrogram_queued_count ?? 0;
    const spectrogramFailed = pagination.spectrogram_failed_count ?? 0;

    return {
      totalRecordings: pagination.total,
      finishedRecordings: finishedCount,
      annotatedRecordings: annotatedCount,
      totalDuration: Math.round(totalDuration / 60), // in minutes
      finishedProgress:
        pagination.total > 0
          ? Math.round((finishedCount / pagination.total) * 100)
          : 0,
      annotationProgress:
        pagination.total > 0
          ? Math.round((annotatedCount / pagination.total) * 100)
          : 0,
      spectrogramReady,
      spectrogramGenerating,
      spectrogramQueued,
      spectrogramFailed,
    };
  }, [pagination]);

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
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 mt-4">
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-600">Total Recordings</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats.totalRecordings}
              </p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-600">Finished</p>
              <p className="text-2xl font-semibold text-green-600">
                {stats.finishedRecordings}
              </p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-600">Annotated</p>
              <p className="text-2xl font-semibold text-yellow-600">
                {stats.annotatedRecordings}
              </p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-600">Spectrograms</p>
              <div className="mt-1 space-y-1">
                <p className="text-sm text-green-700">
                  ✓ {stats.spectrogramReady} ready
                </p>
                {stats.spectrogramGenerating > 0 && (
                  <p className="text-sm text-purple-700">
                    ⟳ {stats.spectrogramGenerating} generating
                  </p>
                )}
                {stats.spectrogramQueued > 0 && (
                  <p className="text-sm text-blue-700">
                    ⏱ {stats.spectrogramQueued} queued
                  </p>
                )}
                {stats.spectrogramFailed > 0 && (
                  <p className="text-sm text-red-700">
                    ✗ {stats.spectrogramFailed} failed
                  </p>
                )}
              </div>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-600">Total Duration</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats.totalDuration} min
              </p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-600">Progress</p>
              <div className="mt-2 space-y-2">
                {/* Finished progress */}
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Finished</span>
                    <span>{stats.finishedProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${stats.finishedProgress}%` }}
                    />
                  </div>
                </div>
                {/* Annotated progress */}
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Annotated</span>
                    <span>{stats.annotationProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-yellow-600 h-2 rounded-full"
                      style={{ width: `${stats.annotationProgress}%` }}
                    />
                  </div>
                </div>
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
                <option value="finished">Finished</option>
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
