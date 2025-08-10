import React, { useState } from 'react';
import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';
import { recordingService } from '../services/api';
import toast from 'react-hot-toast';

interface UploadRecordingModalProps {
  projectId: number;
  onClose: () => void;
  onUploaded: () => void;
}

const UploadRecordingModal: React.FC<UploadRecordingModalProps> = ({
  projectId,
  onClose,
  onUploaded,
}) => {
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(e.target.files);
    }
  };

  const handleUpload = async () => {
    if (!files || files.length === 0) {
      toast.error('Please select at least one file');
      return;
    }

    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    try {
      // Upload files sequentially to avoid overwhelming the server
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
          await recordingService.uploadRecording(projectId, file);
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
          successCount++;
        } catch (error: any) {
          failCount++;
          toast.error(`Failed to upload ${file.name}: ${error.response?.data?.detail || 'Unknown error'}`);
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully uploaded ${successCount} file(s)`);
        onUploaded();
      }
      if (failCount > 0) {
        toast.error(`Failed to upload ${failCount} file(s)`);
      }
    } finally {
      setUploading(false);
      setUploadProgress({});
    }
  };

  const getTotalSize = () => {
    if (!files) return 0;
    let total = 0;
    for (let i = 0; i < files.length; i++) {
      total += files[i].size;
    }
    return (total / 1024 / 1024).toFixed(2);
  };

  return (
    <Transition.Root show={true} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="absolute top-0 right-0 hidden pt-4 pr-4 sm:block">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={onClose}
                    disabled={uploading}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                    <CloudArrowUpIcon className="h-6 w-6 text-blue-600" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                      Upload Recordings
                    </Dialog.Title>
                    <div className="mt-4">
                      <p className="text-sm text-gray-500">
                        Select one or more audio files to upload. Supported formats: MP3, WAV, M4A, FLAC
                      </p>
                      <div className="mt-4">
                        <input
                          type="file"
                          accept=".mp3,.wav,.m4a,.flac"
                          multiple
                          onChange={handleFileChange}
                          disabled={uploading}
                          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                        />
                        {files && files.length > 0 && (
                          <div className="mt-3 space-y-1">
                            <p className="text-sm font-medium text-gray-700">
                              Selected {files.length} file(s) - Total: {getTotalSize()} MB
                            </p>
                            <div className="max-h-32 overflow-y-auto">
                              {Array.from(files).map((file, index) => (
                                <div key={index} className="text-xs text-gray-600">
                                  • {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                                  {uploadProgress[file.name] !== undefined && (
                                    <span className="ml-2 text-blue-600">
                                      {uploadProgress[file.name] === 100 ? '✓' : `${uploadProgress[file.name]}%`}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={!files || files.length === 0 || uploading}
                    className="inline-flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? 'Uploading...' : 'Upload All'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={uploading}
                    className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
};

export default UploadRecordingModal;