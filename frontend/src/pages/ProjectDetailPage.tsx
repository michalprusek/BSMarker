import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, CloudArrowUpIcon, MusicalNoteIcon, TrashIcon, MagnifyingGlassIcon, FunnelIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { Project, Recording } from '../types';
import { projectService, recordingService, annotationService } from '../services/api';
import toast from 'react-hot-toast';
import UploadRecordingModal from '../components/UploadRecordingModal';
// @ts-ignore
import JSZip from 'jszip';

const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedRecordings, setSelectedRecordings] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [minDuration, setMinDuration] = useState('');
  const [maxDuration, setMaxDuration] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const fetchProjectData = useCallback(async () => {
    if (!projectId) return;
    try {
      const projectData = await projectService.getProject(parseInt(projectId));
      setProject(projectData);
      
      const params: any = {};
      if (searchTerm) params.search = searchTerm;
      if (minDuration) params.min_duration = parseFloat(minDuration);
      if (maxDuration) params.max_duration = parseFloat(maxDuration);
      params.sort_by = sortBy;
      params.sort_order = sortOrder;
      
      const recordingsData = await recordingService.getRecordings(parseInt(projectId), params);
      setRecordings(recordingsData);
    } catch (error) {
      toast.error('Failed to fetch project data');
    } finally {
      setLoading(false);
    }
  }, [projectId, searchTerm, minDuration, maxDuration, sortBy, sortOrder]);

  useEffect(() => {
    fetchProjectData();
  }, [fetchProjectData]);

  const handleRecordingUploaded = () => {
    setShowUploadModal(false);
    fetchProjectData();
  };

  const handleDeleteRecording = async (recordingId: number) => {
    try {
      await recordingService.deleteRecording(recordingId);
      toast.success('Recording deleted');
      fetchProjectData();
    } catch (error) {
      toast.error('Failed to delete recording');
    }
  };

  const handleDownloadProject = async () => {
    if (!projectId || recordings.length === 0) return;
    
    setIsDownloading(true);
    
    try {
      // Create a zip file using JSZip
      const zip = new JSZip();
      
      // Create folders
      const recordingsFolder = zip.folder('recordings');
      const spectrogramsFolder = zip.folder('spectrograms');
      const annotationsFolder = zip.folder('annotations');
      const visualizationsFolder = zip.folder('visualizations');
      
      // Process each recording
      for (const recording of recordings) {
        try {
          // Download recording audio file
          const audioBlob = await recordingService.downloadRecording(recording.id);
          if (recordingsFolder) {
            recordingsFolder.file(`${recording.original_filename}`, audioBlob);
          }
          
          // Download spectrogram
          const spectrogramUrl = await recordingService.getSpectrogramUrl(recording.id);
          if (spectrogramUrl && spectrogramsFolder) {
            const spectrogramResponse = await fetch(spectrogramUrl);
            const spectrogramBlob = await spectrogramResponse.blob();
            spectrogramsFolder.file(`${recording.original_filename.replace(/\.[^/.]+$/, '')}_spectrogram.png`, spectrogramBlob);
          }
          
          // Get annotations
          const annotations = await annotationService.getAnnotations(recording.id);
          
          // Save annotations as JSON
          if (annotationsFolder && annotations && annotations.length > 0) {
            const annotationData = {
              recording: {
                id: recording.id,
                filename: recording.original_filename,
                duration: recording.duration,
                sample_rate: recording.sample_rate,
              },
              annotations: annotations[0].bounding_boxes.map((box: any) => ({
                label: box.label || 'None',
                start_time: box.start_time,
                end_time: box.end_time,
                min_frequency: box.min_frequency,
                max_frequency: box.max_frequency,
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height
              }))
            };
            
            const jsonStr = JSON.stringify(annotationData, null, 2);
            annotationsFolder.file(`${recording.original_filename.replace(/\.[^/.]+$/, '')}_annotations.json`, jsonStr);
            
            // Generate visualization with bounding boxes
            if (spectrogramUrl && visualizationsFolder && annotations[0].bounding_boxes.length > 0) {
              try {
                const visualizationBlob = await generateVisualization(
                  spectrogramUrl, 
                  annotations[0].bounding_boxes,
                  recording
                );
                visualizationsFolder.file(
                  `${recording.original_filename.replace(/\.[^/.]+$/, '')}_annotated.png`, 
                  visualizationBlob
                );
              } catch (err) {
                console.error('Failed to generate visualization for', recording.original_filename, err);
              }
            }
          }
        } catch (err) {
          console.error(`Failed to process recording ${recording.original_filename}:`, err);
          toast.error(`Failed to process ${recording.original_filename}`);
        }
      }
      
      // Generate project summary
      const summary = {
        project: {
          id: project?.id,
          name: project?.name,
          description: project?.description,
          created_at: project?.created_at,
        },
        recordings_count: recordings.length,
        total_duration: recordings.reduce((sum, r) => sum + (r.duration || 0), 0),
        export_date: new Date().toISOString(),
      };
      
      zip.file('project_summary.json', JSON.stringify(summary, null, 2));
      
      // Generate and download zip
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project?.name.replace(/[^a-z0-9]/gi, '_')}_export_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Project exported successfully!');
    } catch (error) {
      console.error('Failed to export project:', error);
      toast.error('Failed to export project');
    } finally {
      setIsDownloading(false);
    }
  };
  
  // Generate visualization with bounding boxes drawn on spectrogram
  const generateVisualization = async (
    spectrogramUrl: string, 
    boundingBoxes: any[], 
    recording: Recording
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        // Draw spectrogram
        ctx.drawImage(img, 0, 0);
        
        // Define colors for different labels
        const labelColors: Record<string, string> = {
          'None': 'rgba(107, 114, 128, 0.5)',
          'A': 'rgba(239, 68, 68, 0.5)',
          'B': 'rgba(245, 158, 11, 0.5)',
          'C': 'rgba(16, 185, 129, 0.5)',
          'D': 'rgba(59, 130, 246, 0.5)',
          'E': 'rgba(139, 92, 246, 0.5)',
        };
        
        // Draw bounding boxes
        boundingBoxes.forEach((box) => {
          // Calculate position on image
          const scaleX = img.width / 800; // Assuming default width
          const scaleY = img.height / 400; // Assuming default height
          
          const x = box.x * scaleX;
          const y = box.y * scaleY;
          const width = box.width * scaleX;
          const height = box.height * scaleY;
          
          // Get color for label
          const color = labelColors[box.label] || 'rgba(59, 130, 246, 0.5)';
          
          // Draw box
          ctx.strokeStyle = color.replace('0.5', '1');
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, width, height);
          
          // Fill with semi-transparent color
          ctx.fillStyle = color;
          ctx.fillRect(x, y, width, height);
          
          // Draw label
          if (box.label && box.label !== 'None') {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(box.label, x + 4, y + 16);
          }
        });
        
        // Convert to blob
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        }, 'image/png');
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load spectrogram image'));
      };
      
      img.src = spectrogramUrl;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedRecordings.size === 0) {
      toast.error('No recordings selected');
      return;
    }
    
    setIsDeleting(true);
    try {
      await recordingService.bulkDeleteRecordings(
        parseInt(projectId!),
        Array.from(selectedRecordings)
      );
      toast.success(`Deleted ${selectedRecordings.size} recordings`);
      setSelectedRecordings(new Set());
      fetchProjectData();
    } catch (error) {
      toast.error('Failed to delete recordings');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleRecordingSelection = (recordingId: number) => {
    const newSelection = new Set(selectedRecordings);
    if (newSelection.has(recordingId)) {
      newSelection.delete(recordingId);
    } else {
      newSelection.add(recordingId);
    }
    setSelectedRecordings(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedRecordings.size === recordings.length) {
      setSelectedRecordings(new Set());
    } else {
      setSelectedRecordings(new Set(recordings.map(r => r.id)));
    }
  };

  const handleRecordingClick = (recordingId: number) => {
    navigate(`/recordings/${recordingId}/annotate`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          to="/projects"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-1" />
          Back to Projects
        </Link>
      </div>
      
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">{project.name}</h1>
          <p className="mt-2 text-sm text-gray-700">{project.description}</p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none flex gap-2">
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
          >
            <CloudArrowUpIcon className="h-5 w-5 mr-2" />
            Upload Recording
          </button>
          <button
            onClick={handleDownloadProject}
            disabled={isDownloading || recordings.length === 0}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download all recordings, spectrograms and annotations"
          >
            <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
            {isDownloading ? 'Downloading...' : 'Download All'}
          </button>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="mt-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search recordings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <FunnelIcon className="h-5 w-5 mr-2" />
            Filters
          </button>
          {selectedRecordings.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              <TrashIcon className="h-5 w-5 mr-2" />
              Delete Selected ({selectedRecordings.size})
            </button>
          )}
        </div>
        
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Duration (s)</label>
              <input
                type="number"
                value={minDuration}
                onChange={(e) => setMinDuration(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Duration (s)</label>
              <input
                type="number"
                value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="3600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="created_at">Date Added</option>
                <option value="filename">Filename</option>
                <option value="duration">Duration</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Recordings ({recordings.length})
        </h2>
        {recordings.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <MusicalNoteIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No recordings found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? 'Try adjusting your search criteria.' : 'Upload your first bird song recording to get started.'}
            </p>
            {!searchTerm && (
              <div className="mt-6">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <CloudArrowUpIcon className="h-5 w-5 mr-2" />
                  Upload Recording
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedRecordings.size === recordings.length && recordings.length > 0}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">Select All</span>
              </div>
            </div>
            <ul className="divide-y divide-gray-200">
              {recordings.map((recording) => (
                <li key={recording.id} className="hover:bg-gray-50 transition-colors">
                  <div className="px-4 py-4 sm:px-6 flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedRecordings.has(recording.id)}
                      onChange={() => toggleRecordingSelection(recording.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-4"
                    />
                    <div 
                      className="flex-1 flex items-center cursor-pointer"
                      onClick={() => handleRecordingClick(recording.id)}
                    >
                      <MusicalNoteIcon className="h-10 w-10 text-gray-400 mr-4" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{recording.original_filename}</p>
                        <div className="text-sm text-gray-500">
                          <span>Duration: {recording.duration ? `${recording.duration.toFixed(2)}s` : 'Unknown'}</span>
                          <span className="mx-2">•</span>
                          <span>Sample Rate: {recording.sample_rate ? `${recording.sample_rate}Hz` : 'Unknown'}</span>
                          <span className="mx-2">•</span>
                          <span>{formatDate(recording.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRecording(recording.id);
                      }}
                      className="ml-4 p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete recording"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

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

export default ProjectDetailPage;