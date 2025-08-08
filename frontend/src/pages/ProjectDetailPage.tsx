import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeftIcon, CloudArrowUpIcon, MusicalNoteIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Project, Recording } from '../types';
import { projectService, recordingService } from '../services/api';
import toast from 'react-hot-toast';
import UploadRecordingModal from '../components/UploadRecordingModal';

const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const fetchProjectData = async () => {
    if (!projectId) return;
    try {
      const [projectData, recordingsData] = await Promise.all([
        projectService.getProject(parseInt(projectId)),
        recordingService.getRecordings(parseInt(projectId)),
      ]);
      setProject(projectData);
      setRecordings(recordingsData);
    } catch (error) {
      toast.error('Failed to fetch project data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  const handleRecordingUploaded = () => {
    setShowUploadModal(false);
    fetchProjectData();
  };

  const handleDeleteRecording = async (recordingId: number) => {
    if (!window.confirm('Are you sure you want to delete this recording?')) return;
    
    try {
      await recordingService.deleteRecording(recordingId);
      toast.success('Recording deleted successfully');
      fetchProjectData();
    } catch (error) {
      toast.error('Failed to delete recording');
    }
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
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
          >
            <CloudArrowUpIcon className="h-5 w-5 mr-2" />
            Upload Recording
          </button>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Recordings</h2>
        {recordings.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <MusicalNoteIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No recordings</h3>
            <p className="mt-1 text-sm text-gray-500">Upload your first bird song recording to get started.</p>
            <div className="mt-6">
              <button
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <CloudArrowUpIcon className="h-5 w-5 mr-2" />
                Upload Recording
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {recordings.map((recording) => (
                <li key={recording.id}>
                  <div className="px-4 py-4 sm:px-6 flex items-center justify-between">
                    <div className="flex items-center">
                      <MusicalNoteIcon className="h-10 w-10 text-gray-400 mr-4" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{recording.original_filename}</p>
                        <p className="text-sm text-gray-500">
                          Duration: {recording.duration ? `${recording.duration.toFixed(2)}s` : 'Unknown'} | 
                          Sample Rate: {recording.sample_rate ? `${recording.sample_rate}Hz` : 'Unknown'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Link
                        to={`/recordings/${recording.id}/annotate`}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                      >
                        Annotate
                      </Link>
                      <button
                        onClick={() => handleDeleteRecording(recording.id)}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
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