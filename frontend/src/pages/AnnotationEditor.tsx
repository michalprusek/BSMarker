import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PlayIcon, PauseIcon, BackwardIcon, ForwardIcon } from '@heroicons/react/24/solid';
import { toast } from 'react-toastify';
import WaveSurfer from 'wavesurfer.js';
import { Stage, Layer, Rect, Transformer } from 'react-konva';
import { recordingService, annotationService } from '../services/api';
import { Recording, Annotation, BoundingBox } from '../types';
import BoundingBoxList from '../components/BoundingBoxList';
import LabelModal from '../components/LabelModal';

const AnnotationEditor: React.FC = () => {
  const { recordingId } = useParams<{ recordingId: string }>();
  const navigate = useNavigate();

  const [recording, setRecording] = useState<Recording | null>(null);
  const [spectrogramUrl, setSpectrogramUrl] = useState<string>('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [selectedBox, setSelectedBox] = useState<BoundingBox | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingBox, setDrawingBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [tempBox, setTempBox] = useState<BoundingBox | null>(null);
  const [spectrogramDimensions, setSpectrogramDimensions] = useState({ width: 800, height: 400 });
  
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const stageRef = useRef<any>(null);
  const spectrogramImgRef = useRef<HTMLImageElement>(null);
  const audioUrlRef = useRef<string | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (recordingId) {
      fetchRecordingData();
    }
  }, [recordingId]);

  useEffect(() => {
    if (recording && waveformRef.current && !wavesurferRef.current) {
      initializeWavesurfer();
    }
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      // Clean up object URLs
      if (spectrogramUrl && spectrogramUrl.startsWith('blob:')) {
        URL.revokeObjectURL(spectrogramUrl);
      }
      if (audioUrlRef.current && audioUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, [recording]);

  // Update spectrogram dimensions when image loads
  useEffect(() => {
    if (spectrogramUrl && spectrogramImgRef.current) {
      const img = new Image();
      img.onload = () => {
        setSpectrogramDimensions({
          width: img.width,
          height: img.height
        });
      };
      img.src = spectrogramUrl;
    }
  }, [spectrogramUrl]);

  const fetchRecordingData = async () => {
    if (!recordingId) return;
    try {
      const recordingData = await recordingService.getRecording(parseInt(recordingId));
      setRecording(recordingData);
      
      const annotationsData = await annotationService.getAnnotations(parseInt(recordingId));
      setAnnotations(annotationsData);
      if (annotationsData.length > 0) {
        setBoundingBoxes(annotationsData[0].bounding_boxes || []);
      }
      
      // Fetch spectrogram with authentication
      const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const token = localStorage.getItem('token');
      
      try {
        const response = await fetch(`${baseUrl}/api/v1/recordings/${recordingId}/spectrogram`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          setSpectrogramUrl(objectUrl);
        } else {
          console.error('Failed to fetch spectrogram');
          toast.error('Failed to load spectrogram');
        }
      } catch (error) {
        console.error('Failed to fetch spectrogram:', error);
        toast.error('Failed to load spectrogram');
      }
    } catch (error) {
      console.error('Failed to fetch recording data:', error);
      toast.error('Failed to fetch recording data');
    }
  };

  const initializeWavesurfer = async () => {
    if (!recording || !waveformRef.current) return;
    
    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#4F46E5',
      progressColor: '#818CF8',
      cursorColor: '#EF4444',
      barWidth: 2,
      barRadius: 3,
      cursorWidth: 2,
      height: 100,
      barGap: 3,

      normalize: true,
    });

    wavesurferRef.current = wavesurfer;

    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    const token = localStorage.getItem('token');
    
    try {
      // Fetch audio with authentication
      const response = await fetch(`${baseUrl}/api/v1/recordings/${recording.id}/audio`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        audioUrlRef.current = audioUrl;
        wavesurfer.load(audioUrl);
      } else {
        console.error('Failed to fetch audio');
        toast.error('Failed to load audio');
      }
    } catch (error) {
      console.error('Failed to fetch audio:', error);
      toast.error('Failed to load audio');
    }
    
    wavesurfer.on('ready', () => {
      setDuration(wavesurfer.getDuration());
    });

    wavesurfer.on('audioprocess', () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('play', () => {
      setIsPlaying(true);
    });

    wavesurfer.on('pause', () => {
      setIsPlaying(false);
    });

    wavesurfer.on('finish', () => {
      setIsPlaying(false);
    });
  };

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  const handleBackward = () => {
    if (wavesurferRef.current) {
      const currentTime = wavesurferRef.current.getCurrentTime();
      wavesurferRef.current.seekTo((currentTime - 5) / duration);
    }
  };

  const handleForward = () => {
    if (wavesurferRef.current) {
      const currentTime = wavesurferRef.current.getCurrentTime();
      wavesurferRef.current.seekTo((currentTime + 5) / duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (wavesurferRef.current) {
      wavesurferRef.current.seekTo(newTime / duration);
      setCurrentTime(newTime);
    }
  };

  const handleMouseDown = (e: any) => {
    if (!canvasContainerRef.current) return;
    
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    
    setIsDrawing(true);
    setDrawingBox({
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
    });
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing || !drawingBox) return;
    
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    
    setDrawingBox({
      ...drawingBox,
      width: point.x - drawingBox.x,
      height: point.y - drawingBox.y,
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !drawingBox) return;
    
    setIsDrawing(false);
    
    // Only create box if it has meaningful size
    if (Math.abs(drawingBox.width) > 10 && Math.abs(drawingBox.height) > 10) {
      const normalizedBox = {
        x: drawingBox.width < 0 ? drawingBox.x + drawingBox.width : drawingBox.x,
        y: drawingBox.height < 0 ? drawingBox.y + drawingBox.height : drawingBox.y,
        width: Math.abs(drawingBox.width),
        height: Math.abs(drawingBox.height),
      };
      
      // Calculate time and frequency from position
      const startTime = (normalizedBox.x / spectrogramDimensions.width) * duration;
      const endTime = ((normalizedBox.x + normalizedBox.width) / spectrogramDimensions.width) * duration;
      const maxFreq = 10000 * (1 - normalizedBox.y / spectrogramDimensions.height);
      const minFreq = 10000 * (1 - (normalizedBox.y + normalizedBox.height) / spectrogramDimensions.height);
      
      const newBox: BoundingBox = {
        ...normalizedBox,
        label: '',
        start_time: startTime,
        end_time: endTime,
        min_frequency: minFreq,
        max_frequency: maxFreq,
      };
      
      setTempBox(newBox);
      setShowLabelModal(true);
    }
    
    setDrawingBox(null);
  };

  const handleLabelSubmit = (label: string) => {
    if (tempBox) {
      setBoundingBoxes([...boundingBoxes, { ...tempBox, label }]);
      setTempBox(null);
    }
    setShowLabelModal(false);
  };

  const handleDeleteBox = (index: number) => {
    setBoundingBoxes(boundingBoxes.filter((_, i) => i !== index));
    setSelectedBox(null);
  };

  const handleSaveAnnotations = async () => {
    if (!recording) return;
    
    try {
      await annotationService.createOrUpdateAnnotation(recording.id, boundingBoxes);
      toast.success('Annotations saved successfully');
      fetchRecordingData();
    } catch (error) {
      console.error('Failed to save annotations:', error);
      toast.error('Failed to save annotations');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white shadow rounded-lg mb-6 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button
                onClick={() => navigate(-1)}
                className="mr-4 p-2 rounded-md hover:bg-gray-100"
              >
                <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                Annotation Editor
              </h1>
              {recording && (
                <span className="ml-4 text-sm text-gray-500">
                  {recording.original_filename}
                </span>
              )}
            </div>
            <button
              onClick={handleSaveAnnotations}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Save Annotations
            </button>
          </div>
        </div>

        {/* Main Editor */}
        <div className="bg-white shadow rounded-lg p-6">
          {/* Spectrogram with Annotation Canvas */}
          <div className="mb-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Spectrogram</h2>
            <div 
              ref={canvasContainerRef}
              className="relative border border-gray-300 rounded-lg overflow-hidden"
              style={{ width: spectrogramDimensions.width, height: spectrogramDimensions.height }}
            >
              {spectrogramUrl && (
                <>
                  <img 
                    ref={spectrogramImgRef}
                    src={spectrogramUrl} 
                    alt="Spectrogram"
                    className="absolute top-0 left-0 w-full h-full"
                    style={{ pointerEvents: 'none' }}
                  />
                  <Stage
                    width={spectrogramDimensions.width}
                    height={spectrogramDimensions.height}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    ref={stageRef}
                    style={{ position: 'absolute', top: 0, left: 0 }}
                  >
                    <Layer>
                      {/* Existing bounding boxes */}
                      {boundingBoxes.map((box, index) => (
                        <Rect
                          key={index}
                          x={box.x}
                          y={box.y}
                          width={box.width}
                          height={box.height}
                          stroke={selectedBox === box ? '#EF4444' : '#4F46E5'}
                          strokeWidth={2}
                          fill="transparent"
                          onClick={() => setSelectedBox(box)}
                        />
                      ))}
                      
                      {/* Drawing box */}
                      {drawingBox && (
                        <Rect
                          x={drawingBox.x}
                          y={drawingBox.y}
                          width={drawingBox.width}
                          height={drawingBox.height}
                          stroke="#10B981"
                          strokeWidth={2}
                          fill="transparent"
                          dash={[5, 5]}
                        />
                      )}
                    </Layer>
                  </Stage>
                </>
              )}
            </div>
          </div>

          {/* Audio Waveform */}
          <div className="mb-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Audio Waveform</h2>
            <div 
              ref={waveformRef} 
              className="w-full border border-gray-300 rounded-lg p-2"
              style={{ minHeight: '100px' }}
            />
            
            {/* Time Slider */}
            <div className="mt-4">
              <input
                type="range"
                min="0"
                max={duration}
                value={currentTime}
                onChange={handleSeek}
                className="w-full"
                step="0.1"
              />
              <div className="flex justify-between text-sm text-gray-500 mt-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center space-x-4 mt-4">
              <button
                onClick={handleBackward}
                className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                title="Backward 5s"
              >
                <BackwardIcon className="h-6 w-6 text-gray-700" />
              </button>
              
              <button
                onClick={handlePlayPause}
                className="p-3 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                {isPlaying ? (
                  <PauseIcon className="h-8 w-8 text-white" />
                ) : (
                  <PlayIcon className="h-8 w-8 text-white" />
                )}
              </button>
              
              <button
                onClick={handleForward}
                className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                title="Forward 5s"
              >
                <ForwardIcon className="h-6 w-6 text-gray-700" />
              </button>
            </div>
          </div>

          {/* Bounding Boxes List */}
          <BoundingBoxList
            boxes={boundingBoxes}
            selectedBox={selectedBox}
            onSelect={setSelectedBox}
            onDelete={handleDeleteBox}
          />
        </div>
      </div>

      {showLabelModal && (
        <LabelModal
          onClose={() => setShowLabelModal(false)}
          onSave={handleLabelSubmit}
        />
      )}
    </div>
  );
};

export default AnnotationEditor;