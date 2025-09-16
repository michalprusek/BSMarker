import React, { useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ChartBarIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { Recording } from "../types";
import { PaginationMetadata } from "../types/pagination";

import { FixedSizeList as List } from "react-window";
import InfiniteLoader from "react-window-infinite-loader";

interface VirtualizedRecordingListProps {
  recordings: Recording[];
  pagination: PaginationMetadata;
  selectedRecordings: Set<number>;
  onSelectRecording: (id: number) => void;
  onToggleSelectAll: () => void;
  onLoadMore: (page: number) => Promise<void>;
  isLoadingMore?: boolean;
  height?: number;
}

const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return "N/A";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const RecordingItem = React.memo<{
  recording: Recording;
  isSelected: boolean;
  onSelect: () => void;
  style: React.CSSProperties;
}>(
  ({ recording, isSelected, onSelect, style }) => {
    const navigate = useNavigate();

    const handleCardClick = useCallback(() => {
      navigate(`/recordings/${recording.id}/annotate`);
    }, [navigate, recording.id]);

    const handleCheckboxClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect();
      },
      [onSelect],
    );

    return (
      <div
        style={style}
        className="border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={handleCardClick}
      >
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4 flex-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}}
              onClick={handleCheckboxClick}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {recording.original_filename}
                </p>
                {recording.annotation_count &&
                  recording.annotation_count > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      <CheckIcon className="w-3 h-3 mr-1" />
                      Annotated
                    </span>
                  )}
              </div>
              <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                <span className="flex items-center">
                  <ChartBarIcon className="w-4 h-4 mr-1" />
                  {formatDuration(recording.duration || 0)}
                </span>
                <span>
                  {format(new Date(recording.created_at), "MMM d, yyyy HH:mm")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.recording.id === nextProps.recording.id &&
      prevProps.isSelected === nextProps.isSelected
    );
  },
);

RecordingItem.displayName = "RecordingItem";

export const VirtualizedRecordingList: React.FC<
  VirtualizedRecordingListProps
> = ({
  recordings,
  pagination,
  selectedRecordings,
  onSelectRecording,
  onToggleSelectAll,
  onLoadMore,
  isLoadingMore = false,
  height = 600,
}) => {
  const [loadedPages, setLoadedPages] = useState(new Set([pagination.page]));

  // Infinite loading setup
  const itemCount = pagination.has_next
    ? recordings.length + 1
    : recordings.length;

  const isItemLoaded = useCallback(
    (index: number) => {
      return index < recordings.length;
    },
    [recordings.length],
  );

  const loadMoreItems = useCallback(
    async (startIndex: number, stopIndex: number) => {
      // Calculate which page to load
      const pageSize = pagination.page_size;
      const nextPage = Math.floor(stopIndex / pageSize) + 1;

      if (!loadedPages.has(nextPage) && nextPage <= pagination.total_pages) {
        setLoadedPages((prev) => new Set(Array.from(prev).concat(nextPage)));
        await onLoadMore(nextPage);
      }
    },
    [pagination.page_size, pagination.total_pages, loadedPages, onLoadMore],
  );

  // Row renderer
  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      if (!isItemLoaded(index)) {
        return (
          <div style={style} className="flex items-center justify-center p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        );
      }

      const recording = recordings[index];
      return (
        <RecordingItem
          recording={recording}
          isSelected={selectedRecordings.has(recording.id)}
          onSelect={() => onSelectRecording(recording.id)}
          style={style}
        />
      );
    },
    [recordings, selectedRecordings, onSelectRecording, isItemLoaded],
  );

  // Header with select all
  const allSelected = useMemo(() => {
    return (
      recordings.length > 0 &&
      recordings.every((r) => selectedRecordings.has(r.id))
    );
  }, [recordings, selectedRecordings]);

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleSelectAll}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
            />
            <span className="text-sm text-gray-700">
              {selectedRecordings.size > 0
                ? `${selectedRecordings.size} selected`
                : `${pagination.total} total recordings`}
            </span>
          </div>
          <div className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.total_pages}
          </div>
        </div>
      </div>

      {/* Virtualized List */}
      <InfiniteLoader
        isItemLoaded={isItemLoaded}
        itemCount={itemCount}
        loadMoreItems={loadMoreItems}
      >
        {({ onItemsRendered, ref }: any) => (
          <List
            ref={ref}
            height={height}
            width="100%"
            itemCount={itemCount}
            itemSize={80}
            onItemsRendered={onItemsRendered}
            overscanCount={5}
            className="scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100"
          >
            {Row}
          </List>
        )}
      </InfiniteLoader>

      {/* Loading indicator */}
      {isLoadingMore && (
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
            <span className="text-sm text-gray-600">
              Loading more recordings...
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
