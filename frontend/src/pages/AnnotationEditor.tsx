import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PlayIcon, PauseIcon, ChevronLeftIcon, ChevronRightIcon, XMarkIcon, PencilIcon, TrashIcon, ClipboardDocumentIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon } from '@heroicons/react/24/solid';
import { toast } from 'react-toastify';
import WaveSurfer from 'wavesurfer.js';
import { Stage, Layer, Rect, Line, Circle, Group, Text } from 'react-konva';
import { recordingService, annotationService } from '../services/api';
import { Recording, BoundingBox } from '../types';
import BoundingBoxList from '../components/BoundingBoxList';
import LabelModal from '../components/LabelModal';
import ContextMenu from '../components/ContextMenu';
import SpectrogramScales from '../components/SpectrogramScales';

const PLAYBACK_SPEEDS = [1, 2, 4, 8, 16];
const MAX_HISTORY_SIZE = 20;

// Color palette for different labels
const LABEL_COLORS = [
  { stroke: '#6B7280', fill: 'rgba(107, 114, 128, 0.15)' }, // Gray for "None"
  { stroke: '#EF4444', fill: 'rgba(239, 68, 68, 0.15)' },   // Red
  { stroke: '#F59E0B', fill: 'rgba(245, 158, 11, 0.15)' },  // Amber
  { stroke: '#10B981', fill: 'rgba(16, 185, 129, 0.15)' },  // Emerald
  { stroke: '#3B82F6', fill: 'rgba(59, 130, 246, 0.15)' },  // Blue
  { stroke: '#8B5CF6', fill: 'rgba(139, 92, 246, 0.15)' },  // Violet
  { stroke: '#EC4899', fill: 'rgba(236, 72, 153, 0.15)' },  // Pink
  { stroke: '#14B8A6', fill: 'rgba(20, 184, 166, 0.15)' },  // Teal
  { stroke: '#F97316', fill: 'rgba(249, 115, 22, 0.15)' },  // Orange
  { stroke: '#84CC16', fill: 'rgba(132, 204, 22, 0.15)' },  // Lime
  { stroke: '#06B6D4', fill: 'rgba(6, 182, 212, 0.15)' },   // Cyan
  { stroke: '#A855F7', fill: 'rgba(168, 85, 247, 0.15)' },  // Purple
];

const AnnotationEditor: React.FC = () => {
  const { recordingId } = useParams<{ recordingId: string }>();
  const navigate = useNavigate();

  const [recording, setRecording] = useState<Recording | null>(null);
  const [projectRecordings, setProjectRecordings] = useState<Recording[]>([]);
  const [currentRecordingIndex, setCurrentRecordingIndex] = useState<number>(0);
  const [spectrogramUrl, setSpectrogramUrl] = useState<string>('');
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
  const [showSidebar, setShowSidebar] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [verticalScrollOffset, setVerticalScrollOffset] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentSpeedIndex, setCurrentSpeedIndex] = useState(0);
  const [isAnnotationMode, setIsAnnotationMode] = useState(false);
  const [isRewindingLeft, setIsRewindingLeft] = useState(false);
  const [isRewindingRight, setIsRewindingRight] = useState(false);
  const [selectedBoxes, setSelectedBoxes] = useState<Set<number>>(new Set());
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; boxIndex?: number } | null>(null);
  const [clipboardBox, setClipboardBox] = useState<BoundingBox | BoundingBox[] | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<{ boxIndex: number; handle: string } | null>(null);
  const [draggingBox, setDraggingBox] = useState<{ index: number; initialBox: BoundingBox; dragOffset: { x: number; y: number }; selectedIndices?: Set<number>; initialPositions?: Map<number, { x: number; y: number }> } | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [resizingBox, setResizingBox] = useState<{ index: number; handle: string } | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [labelColorMap, setLabelColorMap] = useState<Map<string, number>>(new Map([['None', 0]]));
  const [history, setHistory] = useState<BoundingBox[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [lastSavedState, setLastSavedState] = useState<BoundingBox[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [lastAutoSave, setLastAutoSave] = useState<Date>(new Date());
  const [isSaving, setIsSaving] = useState<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [annotationId, setAnnotationId] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  const [segmentDuration, setSegmentDuration] = useState<number | null>(null);
  const [customLabelInput, setCustomLabelInput] = useState<string>('');
  const [showCustomLabelInput, setShowCustomLabelInput] = useState<boolean>(false);
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const [lastClickedBox, setLastClickedBox] = useState<number | null>(null);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStartPos, setPanStartPos] = useState<{ x: number; scrollX: number; y?: number; scrollY?: number } | null>(null);
  const rewindIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wasPlayingRef = useRef<boolean>(false);
  const keyDownArrowRef = useRef<boolean>(false);
  const autosaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const stageRef = useRef<any>(null);
  const spectrogramImgRef = useRef<HTMLImageElement>(null);
  const audioUrlRef = useRef<string | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const unifiedScrollRef = useRef<HTMLDivElement>(null);

  // History management functions
  const addToHistory = useCallback((newBoxes: BoundingBox[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...newBoxes]);
    
    // Keep history size limited
    if (newHistory.length > MAX_HISTORY_SIZE) {
      newHistory.shift();
    } else {
      setHistoryIndex(historyIndex + 1);
    }
    
    setHistory(newHistory);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setBoundingBoxes([...history[newIndex]]);
      setHistoryIndex(newIndex);
      setHasUnsavedChanges(true);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setBoundingBoxes([...history[newIndex]]);
      setHistoryIndex(newIndex);
      setHasUnsavedChanges(true);
    }
  }, [history, historyIndex]);

  // Save annotations with recording change detection
  const saveAnnotations = useCallback(async (recordingIdToSave?: number, boxesToSave?: BoundingBox[]) => {
    const recId = recordingIdToSave || (recording?.id);
    const boxes = boxesToSave || boundingBoxes;
    
    if (!recId || !recording) {
      console.error('Cannot save annotations: no recording ID or recording', { recId, recording });
      return false;
    }
    
    try {
      setIsSaving(true);
      await annotationService.createOrUpdateAnnotation(recId, boxes);
      setLastSavedState([...boxes]);
      setHasUnsavedChanges(false);
      setLastAutoSave(new Date());
      return true;
    } catch (error) {
      console.error('Failed to save annotations:', error);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [recording, boundingBoxes]);

  useEffect(() => {
    if (recordingId) {
      // Save current annotations before switching
      if (recording && hasUnsavedChanges) {
        saveAnnotations(recording.id, boundingBoxes);
      }
      
      // Then fetch new recording data
      fetchRecordingData();
      fetchProjectRecordings();
    }
    
    // Clean up on unmount or when recordingId changes
    return () => {
      if (autosaveIntervalRef.current) {
        clearInterval(autosaveIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingId]);
  
  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      // Clean up blob URLs when component unmounts
      if (spectrogramUrl && spectrogramUrl.startsWith('blob:')) {
        URL.revokeObjectURL(spectrogramUrl);
      }
      if (audioUrlRef.current && audioUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, [spectrogramUrl]);

  // Autosave functionality
  useEffect(() => {
    // Set up autosave interval
    autosaveIntervalRef.current = setInterval(() => {
      if (hasUnsavedChanges && !isSaving && recording?.id) {
        saveAnnotations(recording.id, boundingBoxes);
      }
    }, 30000); // Save every 30 seconds

    return () => {
      if (autosaveIntervalRef.current) {
        clearInterval(autosaveIntervalRef.current);
      }
    };
  }, [hasUnsavedChanges, isSaving, saveAnnotations, recording, boundingBoxes]);

  // Update history when bounding boxes change
  useEffect(() => {
    // Only add to history if this is a user action, not loading from backend
    if (boundingBoxes.length > 0 || history.length > 0) {
      const currentState = JSON.stringify(boundingBoxes);
      const lastHistoryState = history[historyIndex] ? JSON.stringify(history[historyIndex]) : '';
      
      if (currentState !== lastHistoryState && currentState !== JSON.stringify(lastSavedState)) {
        addToHistory(boundingBoxes);
        setHasUnsavedChanges(JSON.stringify(boundingBoxes) !== JSON.stringify(lastSavedState));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundingBoxes]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle keyboard shortcuts if modal or custom input is open
      if (showLabelModal || showCustomLabelInput) {
        return;
      }
      
      // Handle 'A' key for annotation mode toggle
      if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey && selectedBoxes.size === 0) {
        e.preventDefault();
        toggleAnnotationMode();
        return;
      }
      
      // Handle A-Z quick labeling when boxes are selected
      if (selectedBoxes.size > 0 && e.key.length === 1 && /^[b-zB-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const label = e.key.toUpperCase();
        handleQuickLabel(label);
        return;
      }
      
      // Handle arrow key hold for rewind/fast-forward
      if (e.key === 'ArrowLeft' && !keyDownArrowRef.current) {
        e.preventDefault();
        keyDownArrowRef.current = true;
        startRewind('backward');
      } else if (e.key === 'ArrowRight' && !keyDownArrowRef.current) {
        e.preventDefault();
        keyDownArrowRef.current = true;
        startRewind('forward');
      } else if (e.key === ' ') {
        e.preventDefault();
        handlePlayPause();
      } else if (e.key === 'Escape') {
        if (isAnnotationMode) {
          setIsAnnotationMode(false);
        }
        if (selectedBoxes.size > 0) {
          setSelectedBoxes(new Set());
        }
        if (showCustomLabelInput) {
          setShowCustomLabelInput(false);
        }
      } else if (e.key === 'Delete' && selectedBoxes.size > 0) {
        e.preventDefault();
        handleDeleteSelectedBoxes();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        handleCopySelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboardBox) {
        e.preventDefault();
        handlePasteSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveAnnotations();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        handleZoomReset();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        keyDownArrowRef.current = false;
        stopRewind();
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = canvasContainerRef.current?.getBoundingClientRect();
        if (rect) {
          const mouseX = e.clientX - rect.left - 40; // Account for frequency scale
          const mouseY = e.clientY - rect.top - 32; // Account for top offset
          const relativeX = mouseX / (rect.width - 40);
          const relativeY = mouseY / (rect.height * 0.7 - 32);
          
          if (e.deltaY < 0) {
            // Zoom in - maintain cursor position
            const oldZoom = zoomLevel;
            const newZoom = Math.min(oldZoom * 1.5, 10);
            setZoomLevel(newZoom);
            
            // Adjust horizontal scroll to keep cursor position
            if (unifiedScrollRef.current) {
              const scrollContainer = unifiedScrollRef.current;
              const newScrollLeft = (mouseX * newZoom) - (mouseX);
              scrollContainer.scrollLeft = newScrollLeft;
            }
            
            // Adjust vertical scale (zoom spectrogram vertically)
            // This would require additional state for vertical zoom
            // For now, we'll keep vertical zoom synchronized with horizontal
          } else {
            // Zoom out
            const oldZoom = zoomLevel;
            const newZoom = Math.max(oldZoom / 1.5, 1);
            setZoomLevel(newZoom);
            
            // Adjust scroll to keep cursor position
            if (unifiedScrollRef.current) {
              const scrollContainer = unifiedScrollRef.current;
              const newScrollLeft = (mouseX * newZoom) - (mouseX);
              scrollContainer.scrollLeft = Math.max(0, newScrollLeft);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const canvasContainer = canvasContainerRef.current;
    canvasContainer?.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvasContainer?.removeEventListener('wheel', handleWheel);
      if (rewindIntervalRef.current) {
        clearInterval(rewindIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRewindingLeft, isRewindingRight, isAnnotationMode, selectedBoxes, selectedBox, clipboardBox, showLabelModal, showCustomLabelInput, undo, redo, zoomLevel, isPanning]);

  useEffect(() => {
    // Only initialize if we have recording data and the waveform container is ready
    if (recording && waveformRef.current && spectrogramDimensions.width > 0 && !wavesurferRef.current) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        initializeWavesurfer();
      });
    }
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      // Don't revoke URLs here - they might still be needed
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, spectrogramUrl, spectrogramDimensions]);

  useEffect(() => {
    const updateDimensions = () => {
      if (unifiedScrollRef.current) {
        const containerWidth = unifiedScrollRef.current.clientWidth;
        // Use full available height for the combined view
        const containerHeight = unifiedScrollRef.current.clientHeight;
        setSpectrogramDimensions({
          width: containerWidth,
          height: containerHeight
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, [spectrogramUrl]);


  const fetchProjectRecordings = async () => {
    if (!recordingId) return;
    try {
      const currentRec = await recordingService.getRecording(parseInt(recordingId));
      const recordings = await recordingService.getRecordings(currentRec.project_id);
      setProjectRecordings(recordings);
      const index = recordings.findIndex(r => r.id === parseInt(recordingId));
      setCurrentRecordingIndex(index);
    } catch (error) {
      console.error('Failed to fetch project recordings:', error);
    }
  };

  const fetchRecordingData = async () => {
    if (!recordingId) return;
    try {
      const recordingData = await recordingService.getRecording(parseInt(recordingId));
      setRecording(recordingData);
      
      const annotationsData = await annotationService.getAnnotations(parseInt(recordingId));
      if (annotationsData.length > 0) {
        const boxes = annotationsData[0].bounding_boxes || [];
        setBoundingBoxes(boxes);
        setLastSavedState([...boxes]);
        setAnnotationId(annotationsData[0].id || null);
        
        // Reset history for new recording
        setHistory([boxes]);
        setHistoryIndex(0);
        setHasUnsavedChanges(false);
        
        // Initialize color map for existing labels
        const uniqueLabels = new Set(boxes.map(box => box.label || 'None'));
        const newColorMap = new Map([['None', 0]]);
        let colorIndex = 1;
        
        uniqueLabels.forEach(label => {
          if (label !== 'None' && !newColorMap.has(label)) {
            newColorMap.set(label, colorIndex);
            colorIndex = (colorIndex + 1) % LABEL_COLORS.length;
            if (colorIndex === 0) colorIndex = 1; // Skip "None" color
          }
        });
        
        setLabelColorMap(newColorMap);
      } else {
        // No annotations yet
        setBoundingBoxes([]);
        setLastSavedState([]);
        setHistory([[]]);
        setHistoryIndex(0);
        setHasUnsavedChanges(false);
        setAnnotationId(null);
      }
      
      const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8123';
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
    
    // Destroy existing instance if any
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }
    
    // Ensure container has proper dimensions
    const waveformHeight = Math.max(50, spectrogramDimensions.height * 0.25);
    
    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#4F46E5',
      progressColor: '#818CF8',
      cursorColor: 'transparent',  // Hide wavesurfer cursor since we have unified cursor
      barWidth: 2,
      barRadius: 3,
      cursorWidth: 0,  // Hide cursor
      height: waveformHeight,  // 25% of total height
      barGap: 3,
      normalize: true,
      interact: true,
      fillParent: true,  // Use fillParent instead of responsive
      backend: 'WebAudio',
      mediaControls: false,
    });

    wavesurferRef.current = wavesurfer;

    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8877';
    const token = localStorage.getItem('token');
    
    try {
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
      // Waveform will be automatically rendered, no need for manual redraw
    });

    wavesurfer.on('audioprocess', () => {
      const time = wavesurfer.getCurrentTime();
      setCurrentTime(time);
    });

    wavesurfer.on('interaction', () => {
      const time = wavesurfer.getCurrentTime();
      setCurrentTime(time);
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
    
    wavesurfer.on('error', (error) => {
      console.error('WaveSurfer error:', error);
      toast.error('Failed to load waveform');
    });
  };

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  const startRewind = (direction: 'forward' | 'backward') => {
    if (!wavesurferRef.current || !duration) return;
    
    // Don't start if already rewinding
    if (isRewindingLeft || isRewindingRight) return;
    
    // Store current playback state and pause if playing
    wasPlayingRef.current = wavesurferRef.current.isPlaying();
    if (wasPlayingRef.current) {
      wavesurferRef.current.pause();
    }
    
    if (direction === 'backward') {
      setIsRewindingLeft(true);
    } else {
      setIsRewindingRight(true);
    }
    
    // Start continuous seeking
    const seek = () => {
      if (wavesurferRef.current) {
        const currentTime = wavesurferRef.current.getCurrentTime();
        const seekSpeed = direction === 'backward' ? -0.5 : 0.5; // Seek by 0.5 second increments
        const newTime = Math.max(0, Math.min(duration, currentTime + seekSpeed));
        wavesurferRef.current.seekTo(newTime / duration);
        setCurrentTime(newTime);
      }
    };
    
    // Execute first seek immediately
    seek();
    
    // Then continue at interval
    if (!rewindIntervalRef.current) {
      rewindIntervalRef.current = setInterval(seek, 50); // Update every 50ms for smooth scrubbing
    }
  };
  
  const stopRewind = () => {
    if (rewindIntervalRef.current) {
      clearInterval(rewindIntervalRef.current);
      rewindIntervalRef.current = null;
    }
    
    const wasRewinding = isRewindingLeft || isRewindingRight;
    setIsRewindingLeft(false);
    setIsRewindingRight(false);
    
    // Resume playback if it was playing before rewinding
    if (wasRewinding && wasPlayingRef.current && wavesurferRef.current) {
      wavesurferRef.current.play();
    }
  };
  
  const toggleAnnotationMode = () => {
    setIsAnnotationMode(!isAnnotationMode);
  };

  const cyclePlaybackSpeed = () => {
    const nextIndex = (currentSpeedIndex + 1) % PLAYBACK_SPEEDS.length;
    const nextSpeed = PLAYBACK_SPEEDS[nextIndex];
    setCurrentSpeedIndex(nextIndex);
    setPlaybackSpeed(nextSpeed);
    
    if (wavesurferRef.current) {
      wavesurferRef.current.setPlaybackRate(nextSpeed);
    }
  };


  const navigateToRecording = async (index: number) => {
    if (index >= 0 && index < projectRecordings.length) {
      // Save current annotations before navigating
      if (hasUnsavedChanges && recording) {
        await saveAnnotations(recording.id, boundingBoxes);
      }
      
      const nextRecording = projectRecordings[index];
      navigate(`/recordings/${nextRecording.id}/annotate`);
    }
  };

  const handleCopySelection = useCallback(() => {
    if (selectedBoxes.size > 0) {
      const copiedBoxes = boundingBoxes.filter((_, index) => selectedBoxes.has(index));
      setClipboardBox(copiedBoxes.length === 1 ? copiedBoxes[0] : copiedBoxes);
      toast.success(`${copiedBoxes.length} bounding box${copiedBoxes.length > 1 ? 'es' : ''} copied`);
    } else if (selectedBox) {
      setClipboardBox({ ...selectedBox });
      toast.success('Bounding box copied');
    }
  }, [selectedBox, selectedBoxes, boundingBoxes]);

  const handlePasteSelection = useCallback(() => {
    if (!clipboardBox) return;
    
    const pasteAt = contextMenu || mousePosition;
    
    if (Array.isArray(clipboardBox)) {
      // Multiple boxes - paste at center of mass
      const centerX = clipboardBox.reduce((sum, box) => sum + box.x + box.width / 2, 0) / clipboardBox.length;
      const centerY = clipboardBox.reduce((sum, box) => sum + box.y + box.height / 2, 0) / clipboardBox.length;
      const offsetX = pasteAt.x - centerX;
      const offsetY = pasteAt.y - centerY;
      
      const newBoxes = clipboardBox.map(box => ({
        ...box,
        x: box.x + offsetX,
        y: box.y + offsetY,
        start_time: ((box.x + offsetX) / spectrogramDimensions.width) * duration,
        end_time: ((box.x + offsetX + box.width) / spectrogramDimensions.width) * duration,
        max_frequency: 10000 * (1 - (box.y + offsetY) / spectrogramDimensions.height),
        min_frequency: 10000 * (1 - (box.y + offsetY + box.height) / spectrogramDimensions.height),
      }));
      
      setBoundingBoxes([...boundingBoxes, ...newBoxes]);
      setHasUnsavedChanges(true);
      toast.success(`${newBoxes.length} bounding boxes pasted`);
    } else {
      // Single box - center at cursor
      const newBox: BoundingBox = {
        ...clipboardBox,
        x: pasteAt.x - clipboardBox.width / 2,
        y: pasteAt.y - clipboardBox.height / 2,
        start_time: ((pasteAt.x - clipboardBox.width / 2) / spectrogramDimensions.width) * duration,
        end_time: ((pasteAt.x + clipboardBox.width / 2) / spectrogramDimensions.width) * duration,
        max_frequency: 10000 * (1 - (pasteAt.y - clipboardBox.height / 2) / spectrogramDimensions.height),
        min_frequency: 10000 * (1 - (pasteAt.y + clipboardBox.height / 2) / spectrogramDimensions.height),
      };
      setBoundingBoxes([...boundingBoxes, newBox]);
      setHasUnsavedChanges(true);
      toast.success('Bounding box pasted');
    }
  }, [clipboardBox, contextMenu, boundingBoxes, spectrogramDimensions, duration, mousePosition]);

  const handleDeleteSelectedBoxes = useCallback(() => {
    if (selectedBoxes.size > 0) {
      setBoundingBoxes(prev => prev.filter((_, index) => !selectedBoxes.has(index)));
      setSelectedBoxes(new Set());
      setSelectedBox(null);
      setHasUnsavedChanges(true);
      toast.success(`Deleted ${selectedBoxes.size} annotation(s)`);
    }
  }, [selectedBoxes]);

  const handleEditLabel = useCallback((boxIndex: number) => {
    const box = boundingBoxes[boxIndex];
    if (box) {
      setTempBox(box);
      setShowLabelModal(true);
    }
  }, [boundingBoxes]);

  const getResizeHandle = (box: BoundingBox, x: number, y: number) => {
    const handleSize = 8;
    const handles = [
      { name: 'nw', x: box.x, y: box.y },
      { name: 'ne', x: box.x + box.width, y: box.y },
      { name: 'sw', x: box.x, y: box.y + box.height },
      { name: 'se', x: box.x + box.width, y: box.y + box.height },
    ];

    for (const handle of handles) {
      if (
        x >= handle.x - handleSize / 2 &&
        x <= handle.x + handleSize / 2 &&
        y >= handle.y - handleSize / 2 &&
        y <= handle.y + handleSize / 2
      ) {
        return handle.name;
      }
    }
    return null;
  };

  const handleMouseDown = (e: any) => {
    if (!canvasContainerRef.current) return;
    
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const containerHeight = Math.max(spectrogramDimensions.height, 600);
    const spectrogramHeight = containerHeight * 0.75;
    
    // Check if clicking in waveform area (bottom 25%)
    if (point.y > spectrogramHeight) {
      // Handle waveform click for seeking
      if (wavesurferRef.current && duration > 0) {
        const seekPosition = Math.max(0, Math.min(1, (point.x / zoomLevel) / spectrogramDimensions.width));
        wavesurferRef.current.seekTo(seekPosition);
        setCurrentTime(seekPosition * duration);
      }
      // Don't return - allow dragging in waveform area
    }
    
    // Adjust coordinates for spectrogram area only (scale y back to full range)
    const pos = { x: point.x / zoomLevel, y: point.y / 0.75 }; // Adjust x for zoom, y for spectrogram area
    
    // Close context menu if open
    if (contextMenu) {
      setContextMenu(null);
    }
    
    // Check for double-click to play segment
    const currentTime = Date.now();
    const clickedBoxIndex = boundingBoxes.findIndex(
      box => pos.x >= box.x && pos.x <= box.x + box.width &&
             pos.y >= box.y && pos.y <= box.y + box.height
    );
    
    if (clickedBoxIndex !== -1 && clickedBoxIndex === lastClickedBox && currentTime - lastClickTime < 500) {
      // Double-click detected - play the segment
      const box = boundingBoxes[clickedBoxIndex];
      playSegment(box);
      setLastClickTime(0);
      setLastClickedBox(null);
      return;
    }
    
    setLastClickTime(currentTime);
    setLastClickedBox(clickedBoxIndex);
    
    // Check if clicking on a resize handle
    if (!isAnnotationMode && !showLabelModal) {
      for (let i = 0; i < boundingBoxes.length; i++) {
        const box = boundingBoxes[i];
        const handle = getResizeHandle(box, pos.x, pos.y);
        if (handle) {
          setResizingBox({ index: i, handle });
          setDragStartPos(pos);
          setSelectedBox(box);
          return;
        }
      }
    }
    
    // Check if clicking on a box (in non-annotation mode)
    if (!isAnnotationMode) {
      if (clickedBoxIndex !== -1) {
        const clickedBox = boundingBoxes[clickedBoxIndex];
        
        // Check if clicking on resize handle first
        const handle = getResizeHandle(clickedBox, pos.x, point.y);  // Use raw point.y for handle detection
        if (!handle) {
          // Not on a handle, start dragging the box
          if (e.evt.shiftKey && !showLabelModal) {
            // Add to selection (only if modal is not open)
            const newSelection = new Set(selectedBoxes);
            newSelection.add(clickedBoxIndex);
            setSelectedBoxes(newSelection);
          } else if (e.evt.ctrlKey || e.evt.metaKey) {
            // Toggle selection
            const newSelection = new Set(selectedBoxes);
            if (newSelection.has(clickedBoxIndex)) {
              newSelection.delete(clickedBoxIndex);
            } else {
              newSelection.add(clickedBoxIndex);
            }
            setSelectedBoxes(newSelection);
          } else {
            // Check if clicking on an already selected box
            if (selectedBoxes.has(clickedBoxIndex)) {
              // Box is already selected, start dragging all selected boxes
              const initialPositions = new Map<number, { x: number; y: number }>();
              selectedBoxes.forEach(idx => {
                const box = boundingBoxes[idx];
                if (box) {
                  initialPositions.set(idx, { x: box.x, y: box.y });
                }
              });
              
              setDraggingBox({
                index: clickedBoxIndex,
                initialBox: { ...clickedBox },
                dragOffset: { x: pos.x - clickedBox.x, y: pos.y - clickedBox.y },
                selectedIndices: new Set(selectedBoxes),
                initialPositions: initialPositions
              });
            } else {
              // Box is not selected, select only this one and start dragging
              setSelectedBoxes(new Set([clickedBoxIndex]));
              setSelectedBox(clickedBox);
              setDraggingBox({
                index: clickedBoxIndex,
                initialBox: { ...clickedBox },
                dragOffset: { x: pos.x - clickedBox.x, y: pos.y - clickedBox.y }
              });
            }
          }
        }
        return;
      }
      
      // If not shift/ctrl clicking, start panning or click-to-seek
      if (!e.evt.shiftKey && !e.evt.ctrlKey && !e.evt.metaKey) {
        // Single click to seek in spectrogram
        if (wavesurferRef.current && duration > 0) {
          const seekPosition = pos.x / spectrogramDimensions.width;
          wavesurferRef.current.seekTo(seekPosition);
          setCurrentTime(seekPosition * duration);
        }
        
        // Start panning for drag (both horizontal and vertical)
        if (unifiedScrollRef.current) {
          setIsPanning(true);
          setPanStartPos({ 
            x: e.evt.clientX, 
            scrollX: unifiedScrollRef.current.scrollLeft,
            y: e.evt.clientY,
            scrollY: unifiedScrollRef.current.scrollTop
          });
          e.evt.preventDefault();
        }
      } else {
        // Start selection rectangle for shift/ctrl
        setIsSelecting(true);
        setSelectionRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
        setSelectedBoxes(new Set());
        setSelectedBox(null);
      }
    } else {
      // Annotation mode - start drawing (only in spectrogram area)
      if (point.y <= spectrogramHeight) {
        setIsDrawing(true);
        setDrawingBox({ x: pos.x, y: pos.y, width: 0, height: 0 });
      }
    }
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const containerHeight = Math.max(spectrogramDimensions.height, 600);
    const spectrogramHeight = containerHeight * 0.75;
    const pos = { x: point.x / zoomLevel, y: point.y / 0.75 };  // Scale y back to full range for box coordinates
    setMousePosition(pos);
    
    // Handle panning for both horizontal and vertical
    if (isPanning && panStartPos && unifiedScrollRef.current) {
      const deltaX = panStartPos.x - e.evt.clientX;
      unifiedScrollRef.current.scrollLeft = panStartPos.scrollX + deltaX;
      
      if (panStartPos.y !== undefined && panStartPos.scrollY !== undefined) {
        const deltaY = panStartPos.y - e.evt.clientY;
        unifiedScrollRef.current.scrollTop = panStartPos.scrollY + deltaY;
      }
      return;
    }
    
    // Handle waveform drag to seek (continuous dragging)
    if (point.y > spectrogramHeight && e.evt.buttons === 1 && !isAnnotationMode && !isPanning && !draggingBox && !resizingBox) {
      if (wavesurferRef.current && duration > 0) {
        const seekPosition = Math.max(0, Math.min(1, (point.x / zoomLevel) / spectrogramDimensions.width));
        wavesurferRef.current.seekTo(seekPosition);
        setCurrentTime(seekPosition * duration);
      }
      return;
    }
    
    // Handle dragging entire box (with multi-selection support)
    if (draggingBox) {
      const deltaX = pos.x - draggingBox.dragOffset.x - draggingBox.initialBox.x;
      const deltaY = pos.y - draggingBox.dragOffset.y - draggingBox.initialBox.y;
      
      const updatedBoxes = [...boundingBoxes];
      
      // If we have multiple selected boxes, move them all
      if (draggingBox.selectedIndices && draggingBox.selectedIndices.size > 1 && draggingBox.initialPositions) {
        draggingBox.selectedIndices.forEach((index) => {
          const initialPos = draggingBox.initialPositions!.get(index);
          if (initialPos) {
            const box = boundingBoxes[index];
            const newX = Math.max(0, Math.min(spectrogramDimensions.width - box.width, initialPos.x + deltaX));
            const newY = Math.max(0, Math.min(spectrogramDimensions.height - box.height, initialPos.y + deltaY));
            
            updatedBoxes[index] = {
              ...box,
              x: newX,
              y: newY,
              start_time: (newX / spectrogramDimensions.width) * duration,
              end_time: ((newX + box.width) / spectrogramDimensions.width) * duration,
              max_frequency: 10000 * (1 - newY / spectrogramDimensions.height),
              min_frequency: 10000 * (1 - (newY + box.height) / spectrogramDimensions.height),
            };
          }
        });
      } else {
        // Single box drag
        const newX = pos.x - draggingBox.dragOffset.x;
        const newY = pos.y - draggingBox.dragOffset.y;
        
        // Keep box within bounds
        const boundedX = Math.max(0, Math.min(spectrogramDimensions.width - draggingBox.initialBox.width, newX));
        const boundedY = Math.max(0, Math.min(spectrogramDimensions.height - draggingBox.initialBox.height, newY));
        
        updatedBoxes[draggingBox.index] = {
          ...boundingBoxes[draggingBox.index],
          x: boundedX,
          y: boundedY,
          start_time: (boundedX / spectrogramDimensions.width) * duration,
          end_time: ((boundedX + draggingBox.initialBox.width) / spectrogramDimensions.width) * duration,
          max_frequency: 10000 * (1 - boundedY / spectrogramDimensions.height),
          min_frequency: 10000 * (1 - (boundedY + draggingBox.initialBox.height) / spectrogramDimensions.height),
        };
        setSelectedBox(updatedBoxes[draggingBox.index]);
      }
      
      setBoundingBoxes(updatedBoxes);
      setHasUnsavedChanges(true);
      return;
    }
    
    // Handle resizing
    if (resizingBox && dragStartPos) {
      const box = boundingBoxes[resizingBox.index];
      const newBox = { ...box };
      const minSize = 10;
      
      // Constrain y position to spectrogram area
      const maxY = spectrogramDimensions.height / 0.75;
      const constrainedY = Math.min(pos.y, maxY);
      
      switch (resizingBox.handle) {
        case 'nw':
          newBox.width = Math.max(minSize, box.x + box.width - pos.x);
          newBox.height = Math.max(minSize, box.y + box.height - constrainedY);
          newBox.x = Math.min(pos.x, box.x + box.width - minSize);
          newBox.y = Math.min(constrainedY, box.y + box.height - minSize);
          break;
        case 'ne':
          newBox.width = Math.max(minSize, pos.x - box.x);
          newBox.height = Math.max(minSize, box.y + box.height - constrainedY);
          newBox.y = Math.min(constrainedY, box.y + box.height - minSize);
          break;
        case 'sw':
          newBox.width = Math.max(minSize, box.x + box.width - pos.x);
          newBox.height = Math.max(minSize, constrainedY - box.y);
          newBox.x = Math.min(pos.x, box.x + box.width - minSize);
          break;
        case 'se':
          newBox.width = Math.max(minSize, pos.x - box.x);
          newBox.height = Math.max(minSize, constrainedY - box.y);
          break;
      }
      
      // Update time and frequency based on new position
      newBox.start_time = (newBox.x / spectrogramDimensions.width) * duration;
      newBox.end_time = ((newBox.x + newBox.width) / spectrogramDimensions.width) * duration;
      newBox.max_frequency = 10000 * (1 - newBox.y / spectrogramDimensions.height);
      newBox.min_frequency = 10000 * (1 - (newBox.y + newBox.height) / spectrogramDimensions.height);
      
      const updatedBoxes = [...boundingBoxes];
      updatedBoxes[resizingBox.index] = newBox;
      setBoundingBoxes(updatedBoxes);
      setSelectedBox(newBox);
      setHasUnsavedChanges(true);
      return;
    }
    
    // Handle selection rectangle
    if (isSelecting && selectionRect) {
      setSelectionRect({
        ...selectionRect,
        width: pos.x - selectionRect.x,
        height: pos.y - selectionRect.y,
      });
      
      // Update selected boxes based on selection rectangle
      const rect = {
        x: Math.min(selectionRect.x, pos.x),
        y: Math.min(selectionRect.y, pos.y),
        width: Math.abs(pos.x - selectionRect.x),
        height: Math.abs(pos.y - selectionRect.y),
      };
      
      const newSelection = new Set<number>();
      boundingBoxes.forEach((box, index) => {
        if (
          box.x < rect.x + rect.width &&
          box.x + box.width > rect.x &&
          box.y < rect.y + rect.height &&
          box.y + box.height > rect.y
        ) {
          newSelection.add(index);
        }
      });
      setSelectedBoxes(newSelection);
      return;
    }
    
    // Handle drawing new box (constrain to spectrogram area)
    if (isDrawing && drawingBox) {
      const maxY = spectrogramDimensions.height / 0.75;  // Max y in original coordinate space
      const constrainedY = Math.min(pos.y, maxY);
      setDrawingBox({
        ...drawingBox,
        width: pos.x - drawingBox.x,
        height: constrainedY - drawingBox.y,
      });
      return;
    }
    
    // Update cursor and hover state for resize handles
    if (!isAnnotationMode && !isDrawing && !isSelecting) {
      let foundHandle = false;
      for (let i = 0; i < boundingBoxes.length; i++) {
        const box = boundingBoxes[i];
        const handle = getResizeHandle(box, pos.x, pos.y);
        if (handle) {
          setHoveredHandle({ boxIndex: i, handle });
          foundHandle = true;
          break;
        }
      }
      if (!foundHandle) {
        setHoveredHandle(null);
      }
    }
  };

  const handleMouseUp = () => {
    // Handle panning end
    if (isPanning) {
      setIsPanning(false);
      setPanStartPos(null);
      return;
    }
    
    // Handle drag end
    if (draggingBox) {
      setDraggingBox(null);
      return;
    }
    
    // Handle resize end
    if (resizingBox) {
      setResizingBox(null);
      setDragStartPos(null);
      return;
    }
    
    // Handle selection rectangle end
    if (isSelecting) {
      setIsSelecting(false);
      setSelectionRect(null);
      return;
    }
    
    // Handle drawing end
    if (isDrawing && drawingBox) {
      setIsDrawing(false);
      
      if (Math.abs(drawingBox.width) > 10 && Math.abs(drawingBox.height) > 10) {
        const normalizedBox = {
          x: drawingBox.width < 0 ? drawingBox.x + drawingBox.width : drawingBox.x,
          y: drawingBox.height < 0 ? drawingBox.y + drawingBox.height : drawingBox.y,
          width: Math.abs(drawingBox.width),
          height: Math.abs(drawingBox.height),
        };
        
        const startTime = (normalizedBox.x / spectrogramDimensions.width) * duration;
        const endTime = ((normalizedBox.x + normalizedBox.width) / spectrogramDimensions.width) * duration;
        const maxFreq = 22050 * (1 - normalizedBox.y / spectrogramDimensions.height);  // Nyquist frequency
        const minFreq = 22050 * (1 - (normalizedBox.y + normalizedBox.height) / spectrogramDimensions.height);
        
        const newBox: BoundingBox = {
          ...normalizedBox,
          label: 'None',  // Auto-assign "None" label
          start_time: startTime,
          end_time: endTime,
          min_frequency: minFreq,
          max_frequency: maxFreq,
        };
        
        // Add the box directly without showing the label modal
        setBoundingBoxes([...boundingBoxes, newBox]);
        setHasUnsavedChanges(true);
        toast.success('Annotation added with "None" label. Right-click to edit label.');
      }
      
      setDrawingBox(null);
    }
  };

  const handleContextMenu = (e: any) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    
    // Check if right-clicking on a box
    const clickedBoxIndex = boundingBoxes.findIndex(
      box => point.x >= box.x && point.x <= box.x + box.width &&
             point.y >= box.y && point.y <= box.y + box.height
    );
    
    if (clickedBoxIndex !== -1) {
      // Check if clicking on a selected box
      if (selectedBoxes.has(clickedBoxIndex)) {
        // Clicked on one of the selected boxes - keep all selected boxes
        // Don't change selection, just show context menu
      } else {
        // Clicked on a non-selected box - select only this one
        setSelectedBox(boundingBoxes[clickedBoxIndex]);
        setSelectedBoxes(new Set([clickedBoxIndex]));
      }
      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, boxIndex: clickedBoxIndex });
    } else {
      // Right-click on empty space
      // Optionally clear selection (or keep it - depends on UX preference)
      // For now, we'll keep the selection as per requirement
      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY });
    }
  };

  const handleLabelSubmit = (label: string) => {
    if (tempBox) {
      // Check if we're editing an existing box
      const existingIndex = boundingBoxes.findIndex(box => 
        box.x === tempBox.x && box.y === tempBox.y && 
        box.width === tempBox.width && box.height === tempBox.height
      );
      
      if (existingIndex !== -1) {
        // Update existing box
        const updatedBoxes = [...boundingBoxes];
        updatedBoxes[existingIndex] = { ...tempBox, label };
        setBoundingBoxes(updatedBoxes);
        setHasUnsavedChanges(true);
      } else {
        // Add new box
        setBoundingBoxes([...boundingBoxes, { ...tempBox, label }]);
        setHasUnsavedChanges(true);
      }
      setTempBox(null);
    }
    setShowLabelModal(false);
  };

  const handleDeleteBox = (index: number) => {
    setBoundingBoxes(boundingBoxes.filter((_, i) => i !== index));
    setSelectedBox(null);
    setHasUnsavedChanges(true);
  };

  const handleSaveAnnotations = async () => {
    if (!recording) return;
    
    try {
      setIsSaving(true);
      const success = await saveAnnotations(recording.id, boundingBoxes);
      if (success) {
        toast.success('Annotations saved successfully');
        setHasUnsavedChanges(false);
        setLastSavedState(boundingBoxes);
      } else {
        toast.error('Failed to save annotations');
      }
    } catch (error) {
      console.error('Failed to save annotations:', error);
      toast.error('Failed to save annotations');
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Zoom handlers
  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev * 1.5, 10));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev / 1.5, 1));
  };

  const handleZoomReset = () => {
    setZoomLevel(1);
    setScrollOffset(0);
  };

  // Quick label handler for A-Z keys
  const handleQuickLabel = (label: string) => {
    const updatedBoxes = [...boundingBoxes];
    let updateCount = 0;
    
    selectedBoxes.forEach(index => {
      if (updatedBoxes[index]) {
        updatedBoxes[index] = { ...updatedBoxes[index], label };
        updateCount++;
      }
    });
    
    if (updateCount > 0) {
      setBoundingBoxes(updatedBoxes);
      toast.success(`Label "${label}" assigned to ${updateCount} box${updateCount > 1 ? 'es' : ''}`);
      setHasUnsavedChanges(true);
    }
  };

  // Custom label handler for multiple boxes
  const handleCustomLabel = () => {
    if (selectedBoxes.size > 0) {
      setShowCustomLabelInput(true);
    }
  };

  const applyCustomLabel = () => {
    if (customLabelInput.trim()) {
      const updatedBoxes = [...boundingBoxes];
      let updateCount = 0;
      
      selectedBoxes.forEach(index => {
        if (updatedBoxes[index]) {
          updatedBoxes[index] = { ...updatedBoxes[index], label: customLabelInput.trim() };
          updateCount++;
        }
      });
      
      if (updateCount > 0) {
        setBoundingBoxes(updatedBoxes);
        toast.success(`Label "${customLabelInput.trim()}" assigned to ${updateCount} box${updateCount > 1 ? 'es' : ''}`);
        setHasUnsavedChanges(true);
      }
    }
    setShowCustomLabelInput(false);
    setCustomLabelInput('');
  };

  // Play segment handler
  const playSegment = (box: BoundingBox) => {
    if (wavesurferRef.current && box.start_time !== undefined && box.end_time !== undefined) {
      wavesurferRef.current.seekTo(box.start_time / duration);
      wavesurferRef.current.play();
      
      // Set up timer to stop at segment end
      const checkInterval = setInterval(() => {
        if (wavesurferRef.current) {
          const currentTime = wavesurferRef.current.getCurrentTime();
          if (currentTime >= box.end_time!) {
            wavesurferRef.current.pause();
            clearInterval(checkInterval);
          }
        }
      }, 50);
      
      // Clear interval if playback is paused manually
      const pauseHandler = () => {
        clearInterval(checkInterval);
      };
      
      wavesurferRef.current.once('pause', pauseHandler);
    }
  };

  // Export handler
  const handleExport = () => {
    const exportData = {
      recording: {
        id: recording?.id,
        filename: recording?.original_filename,
        duration: duration,
        sample_rate: recording?.sample_rate,
      },
      annotations: boundingBoxes.map((box, index) => ({
        id: index,
        label: box.label || 'None',
        start_time: box.start_time,
        end_time: box.end_time,
        min_frequency: box.min_frequency,
        max_frequency: box.max_frequency,
        duration_ms: ((box.end_time || 0) - (box.start_time || 0)) * 1000,
      })),
      export_date: new Date().toISOString(),
    };

    // Export as JSON
    const jsonBlob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = `${recording?.original_filename || 'annotations'}_${Date.now()}.json`;
    jsonLink.click();
    URL.revokeObjectURL(jsonUrl);

    // Export as CSV
    const csvHeader = 'Label,Start Time (s),End Time (s),Duration (ms),Min Frequency (Hz),Max Frequency (Hz)\n';
    const csvRows = boundingBoxes.map(box => 
      `${box.label || 'None'},${box.start_time?.toFixed(3)},${box.end_time?.toFixed(3)},${(((box.end_time || 0) - (box.start_time || 0)) * 1000).toFixed(1)},${box.min_frequency?.toFixed(1)},${box.max_frequency?.toFixed(1)}`
    ).join('\n');
    const csvBlob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
    const csvUrl = URL.createObjectURL(csvBlob);
    const csvLink = document.createElement('a');
    csvLink.href = csvUrl;
    csvLink.download = `${recording?.original_filename || 'annotations'}_${Date.now()}.csv`;
    csvLink.click();
    URL.revokeObjectURL(csvUrl);

    toast.success('Annotations exported as JSON and CSV');
  };

  // Calculate and update segment duration when selection changes
  useEffect(() => {
    if (selectedBoxes.size === 1) {
      const boxIndex = Array.from(selectedBoxes)[0];
      const box = boundingBoxes[boxIndex];
      if (box && box.start_time !== undefined && box.end_time !== undefined) {
        setSegmentDuration((box.end_time - box.start_time) * 1000); // Convert to milliseconds
      }
    } else if (drawingBox && duration > 0) {
      const startTime = (Math.min(drawingBox.x, drawingBox.x + drawingBox.width) / spectrogramDimensions.width) * duration;
      const endTime = (Math.max(drawingBox.x, drawingBox.x + drawingBox.width) / spectrogramDimensions.width) * duration;
      setSegmentDuration((endTime - startTime) * 1000);
    } else {
      setSegmentDuration(null);
    }
  }, [selectedBoxes, boundingBoxes, drawingBox, spectrogramDimensions, duration]);

  const getLabelColor = (label: string) => {
    let colorIndex = labelColorMap.get(label);
    
    if (colorIndex === undefined) {
      // Assign next available color index
      const usedIndices = new Set(labelColorMap.values());
      let nextIndex = 1; // Start from 1 (0 is reserved for "None")
      
      while (usedIndices.has(nextIndex) && nextIndex < LABEL_COLORS.length) {
        nextIndex++;
      }
      
      // If all colors are used, cycle back
      if (nextIndex >= LABEL_COLORS.length) {
        nextIndex = 1 + (labelColorMap.size % (LABEL_COLORS.length - 1));
      }
      
      const newMap = new Map(labelColorMap);
      newMap.set(label, nextIndex);
      setLabelColorMap(newMap);
      colorIndex = nextIndex;
    }
    
    return LABEL_COLORS[colorIndex] || LABEL_COLORS[0];
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Simplified Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigate('/projects')}
              className="p-1 rounded-md hover:bg-gray-100"
              title="Back to Projects"
            >
              <ArrowLeftIcon className="h-4 w-4 text-gray-500" />
            </button>
            
            {/* Recording Navigation */}
            <div className="flex items-center space-x-1">
              <button
                onClick={() => navigateToRecording(currentRecordingIndex - 1)}
                disabled={currentRecordingIndex === 0}
                className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous recording (←)"
              >
                <ChevronLeftIcon className="h-4 w-4 text-gray-600" />
              </button>
              
              <div className="text-xs text-gray-600">
                <span className="font-medium">{currentRecordingIndex + 1}</span>
                <span className="text-gray-400">/</span>
                <span className="font-medium">{projectRecordings.length}</span>
              </div>
              
              <button
                onClick={() => navigateToRecording(currentRecordingIndex + 1)}
                disabled={currentRecordingIndex === projectRecordings.length - 1}
                className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Next recording (→)"
              >
                <ChevronRightIcon className="h-4 w-4 text-gray-600" />
              </button>
            </div>

            {recording && (
              <div className="text-sm text-gray-700 max-w-[300px] truncate">
                <span className="font-medium" title={recording.original_filename}>{recording.original_filename}</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Segment Duration Display */}
            {segmentDuration !== null && (
              <div className="px-2 py-1 bg-blue-50 rounded text-sm text-blue-700 font-medium">
                {segmentDuration < 1000 ? `${segmentDuration.toFixed(1)}ms` : `${(segmentDuration / 1000).toFixed(2)}s`}
              </div>
            )}
            
            <button
              onClick={handleSaveAnnotations}
              disabled={isSaving || !hasUnsavedChanges}
              className={`px-3 py-1.5 text-sm font-medium text-white rounded-md transition-colors ${
                hasUnsavedChanges 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save' : 'Saved'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
        {/* Canvas Area */}
        <div className="flex-1 flex" style={{ marginRight: showSidebar ? '448px' : '64px' }}>
        {/* Editor Area */}
        <div className="flex-1 flex flex-col" style={{ height: '100%', overflow: 'hidden', padding: '0' }}>
          {/* Unified Spectrogram and Waveform Container */}
          <div className="relative bg-white border-l border-r border-b border-gray-300" style={{ height: '100%', overflow: 'hidden' }}>
            {/* Scales */}
            {spectrogramUrl && duration > 0 && (
              <SpectrogramScales
                width={spectrogramDimensions.width}
                height={spectrogramDimensions.height}
                duration={duration}
                maxFrequency={22050}
                zoomLevel={zoomLevel}
                scrollOffset={scrollOffset}
              />
            )}
            
            {/* Unified container with both horizontal and vertical scroll */}
            <div 
              ref={unifiedScrollRef}
              className="absolute inset-0 overflow-auto"
              style={{ 
                left: '40px', 
                bottom: '64px',  // Increased to account for playback controls (32px + 32px)
                width: 'calc(100% - 40px)',
                height: 'calc(100% - 64px)'  // Adjusted height
              }}
              onScroll={(e) => {
                const target = e.target as HTMLElement;
                const horizontalScrollPercentage = target.scrollWidth > target.clientWidth 
                  ? (target.scrollLeft / (target.scrollWidth - target.clientWidth)) * 100 
                  : 0;
                const verticalScrollPercentage = target.scrollHeight > target.clientHeight
                  ? (target.scrollTop / (target.scrollHeight - target.clientHeight)) * 100
                  : 0;
                setScrollOffset(horizontalScrollPercentage);
                setVerticalScrollOffset(verticalScrollPercentage);
              }}
            >
              <div 
                ref={canvasContainerRef}
                className="relative"
                style={{
                  width: `${spectrogramDimensions.width * zoomLevel}px`,
                  height: '100%',
                  minHeight: '400px'
                }}
              >
                {/* Split view: 75% spectrogram, 25% waveform */}
                <div className="absolute" style={{ 
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '75%'
                }}>
                  {spectrogramUrl ? (
                    <img 
                      ref={spectrogramImgRef}
                      src={spectrogramUrl} 
                      alt="Spectrogram"
                      className="absolute"
                      onError={(e) => {
                        console.error('Failed to load spectrogram image:', spectrogramUrl);
                        toast.error('Failed to load spectrogram image');
                      }}
                      onLoad={() => {
                        console.log('Spectrogram loaded successfully:', spectrogramUrl);
                      }}
                      style={{ 
                        top: '0',
                        left: '40px',  // Offset for frequency scale
                        width: 'calc(100% - 40px)',
                        height: '100%',
                        objectFit: 'fill',  // Stretch to fill the exact space
                        pointerEvents: 'none',
                        imageRendering: zoomLevel > 2 ? 'pixelated' : 'auto',
                        transform: 'scale(1)',
                        transformOrigin: 'top left'
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full bg-gray-100">
                      <p className="text-gray-500">Loading spectrogram...</p>
                    </div>
                  )}
                </div>
                
                
                {/* Waveform at bottom 25% */}
                <div 
                  className="absolute bg-gray-50"
                  style={{ 
                    top: '75%',
                    left: 0,
                    right: 0,
                    height: '25%',
                    overflow: 'hidden'
                  }}
                >
                  <div 
                    ref={waveformRef} 
                    id="waveform-container"
                    className="w-full h-full"
                    style={{ 
                      width: `${(spectrogramDimensions.width - 40) * zoomLevel}px`,  // Account for frequency scale
                      height: '100%',
                      position: 'relative',
                      marginLeft: '40px',  // Align with spectrogram
                      minHeight: '80px',
                      display: 'block'
                    }}
                  />
                  
                  {/* Bounding box projections on waveform */}
                  <svg 
                    className="absolute top-0 pointer-events-none"
                    style={{ 
                      left: '40px',  // Align with waveform
                      width: `${(spectrogramDimensions.width - 40) * zoomLevel}px`,
                      height: '100%'
                    }}
                  >
                    {boundingBoxes.map((box, index) => {
                      const isSelected = selectedBoxes.has(index);
                      const labelColor = getLabelColor(box.label || 'None');
                      const startX = ((box.start_time || 0) / duration) * (spectrogramDimensions.width - 40) * zoomLevel;
                      const endX = ((box.end_time || 0) / duration) * (spectrogramDimensions.width - 40) * zoomLevel;
                      const waveformHeight = spectrogramDimensions.height * 0.25;  // 25% for waveform
                      
                      return (
                        <g key={index}>
                          {/* Start line */}
                          <line
                            x1={startX}
                            y1="0"
                            x2={startX}
                            y2={waveformHeight}
                            stroke={labelColor.stroke}
                            strokeWidth={isSelected ? 2 : 1}
                            opacity={0.7}
                          />
                          {/* End line */}
                          <line
                            x1={endX}
                            y1="0"
                            x2={endX}
                            y2={waveformHeight}
                            stroke={labelColor.stroke}
                            strokeWidth={isSelected ? 2 : 1}
                            opacity={0.7}
                          />
                          {/* Horizontal connector at top */}
                          <line
                            x1={startX}
                            y1="2"
                            x2={endX}
                            y2="2"
                            stroke={labelColor.stroke}
                            strokeWidth={isSelected ? 2 : 1}
                            opacity={0.7}
                          />
                          {/* Fill area */}
                          <rect
                            x={startX}
                            y="0"
                            width={endX - startX}
                            height={waveformHeight}
                            fill={labelColor.fill}
                            opacity={0.3}
                          />
                        </g>
                      );
                    })}
                  </svg>
                </div>
                
                {/* Unified Canvas for annotations and cursor */}
                <Stage
                  width={(spectrogramDimensions.width - 40) * zoomLevel}  // Account for frequency scale
                  height={spectrogramDimensions.height}  // Full height to include waveform
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onContextMenu={handleContextMenu}
                  ref={stageRef}
                  style={{ 
                    position: 'absolute', 
                    top: '0',
                    left: '40px',  // Offset for frequency scale
                    cursor: isAnnotationMode ? 'crosshair' : 
                            isPanning ? 'grabbing' :
                            hoveredHandle ? ((hoveredHandle.handle.includes('n') && hoveredHandle.handle.includes('w')) || 
                                            (hoveredHandle.handle.includes('s') && hoveredHandle.handle.includes('e')) ? 'nwse-resize' : 'nesw-resize') :
                            draggingBox ? 'grabbing' :
                            resizingBox ? 'grabbing' :
                            isSelecting ? 'crosshair' : 
                            boundingBoxes.some(box => 
                              mousePosition.x >= box.x && mousePosition.x <= box.x + box.width &&
                              mousePosition.y >= box.y && mousePosition.y <= box.y + box.height
                            ) ? 'move' : 
                            mousePosition.y > Math.max(spectrogramDimensions.height, 600) * 0.75 ? 'pointer' : 'default'
                  }}
                >
                  <Layer>
                    {/* Selection rectangle - scale to spectrogram area */}
                    {selectionRect && (
                      <Rect
                        x={Math.min(selectionRect.x, selectionRect.x + selectionRect.width) * zoomLevel}
                        y={Math.min(selectionRect.y, selectionRect.y + selectionRect.height) * 0.7}
                        width={Math.abs(selectionRect.width) * zoomLevel}
                        height={Math.abs(selectionRect.height) * 0.7}
                        fill="rgba(59, 130, 246, 0.1)"
                        stroke="#3B82F6"
                        strokeWidth={1}
                        dash={[5, 5]}
                      />
                    )}
                    
                    {/* Bounding boxes - only in spectrogram area (top 75%) */}
                    {boundingBoxes.map((box, index) => {
                      const isSelected = selectedBoxes.has(index);
                      const isSingleSelected = selectedBox === box;
                      const labelColor = getLabelColor(box.label || 'None');
                      
                      // Scale box coordinates with zoom and adjust for spectrogram area only
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      const containerHeight = Math.max(spectrogramDimensions.height, 600);
                      const scaledBox = {
                        x: box.x * zoomLevel,
                        y: box.y * 0.75,  // Scale y position to fit in top 75%
                        width: box.width * zoomLevel,
                        height: box.height * 0.75  // Scale height to fit in top 75%
                      };
                      
                      // Use label color as base, but modify for selection states
                      let strokeColor = labelColor.stroke;
                      let fillColor = labelColor.fill;
                      let strokeWidth = 2;
                      
                      if (isSelected || isSingleSelected) {
                        strokeWidth = 3;
                        // Use brighter version of the same label color for selection
                        fillColor = fillColor.replace('0.15', '0.35');
                        // Make stroke slightly brighter too
                        const rgb = strokeColor.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
                        if (rgb) {
                          const r = Math.min(255, parseInt(rgb[1], 16) + 30);
                          const g = Math.min(255, parseInt(rgb[2], 16) + 30);
                          const b = Math.min(255, parseInt(rgb[3], 16) + 30);
                          strokeColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                        }
                      }
                      
                      return (
                        <Group key={index}>
                          <Rect
                            x={scaledBox.x}
                            y={scaledBox.y}
                            width={scaledBox.width}
                            height={scaledBox.height}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                            fill={fillColor}
                          />
                          
                          {/* Label text */}
                          {box.label && (
                            <>
                              {/* Background for label */}
                              <Rect
                                x={scaledBox.x}
                                y={scaledBox.y - 20}
                                width={Math.min(scaledBox.width, box.label.length * 8 + 8)}
                                height={18}
                                fill="rgba(0, 0, 0, 0.7)"
                                cornerRadius={2}
                              />
                              {/* Label text */}
                              <Text
                                x={scaledBox.x + 4}
                                y={scaledBox.y - 15}
                                text={box.label}
                                fill="white"
                                fontSize={12}
                                fontFamily="Inter, system-ui, sans-serif"
                              />
                            </>
                          )}
                          
                          {/* Resize handles */}
                          {(isSingleSelected || isSelected) && !isAnnotationMode && (
                            <>
                              {/* Corner handles */}
                              <Circle
                                x={scaledBox.x}
                                y={scaledBox.y}
                                radius={4}
                                fill="white"
                                stroke={strokeColor}
                                strokeWidth={2}
                              />
                              <Circle
                                x={scaledBox.x + scaledBox.width}
                                y={scaledBox.y}
                                radius={4}
                                fill="white"
                                stroke={strokeColor}
                                strokeWidth={2}
                              />
                              <Circle
                                x={scaledBox.x}
                                y={scaledBox.y + scaledBox.height}
                                radius={4}
                                fill="white"
                                stroke={strokeColor}
                                strokeWidth={2}
                              />
                              <Circle
                                x={scaledBox.x + scaledBox.width}
                                y={scaledBox.y + scaledBox.height}
                                radius={4}
                                fill="white"
                                stroke={strokeColor}
                                strokeWidth={2}
                              />
                            </>
                          )}
                        </Group>
                      );
                    })}
                    
                    {/* Drawing box - scale to spectrogram area */}
                    {drawingBox && (
                      <Rect
                        x={(drawingBox.width < 0 ? drawingBox.x + drawingBox.width : drawingBox.x) * zoomLevel}
                        y={(drawingBox.height < 0 ? drawingBox.y + drawingBox.height : drawingBox.y) * 0.75}
                        width={Math.abs(drawingBox.width || 0) * zoomLevel}
                        height={Math.abs(drawingBox.height || 0) * 0.75}
                        stroke="#10B981"
                        strokeWidth={2}
                        fill="transparent"
                        dash={[5, 5]}
                      />
                    )}
                    
                    {/* Cursor line only for spectrogram area */}
                    {duration > 0 && (
                      <Line
                        points={[
                          (currentTime / duration) * (spectrogramDimensions.width - 40) * zoomLevel,
                          0,
                          (currentTime / duration) * (spectrogramDimensions.width - 40) * zoomLevel,
                          spectrogramDimensions.height  // Full height including waveform
                        ]}
                        stroke="#EF4444"
                        strokeWidth={2}
                        listening={false}
                      />
                    )}
                  </Layer>
                </Stage>
              </div>
            </div>
            
            {/* Integrated Playback Controls - inside the unified frame */}
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gray-50 border-t border-gray-300 flex items-center px-4">
              <div className="flex items-center space-x-3">
                <button
                  onClick={handlePlayPause}
                  className="p-1 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors"
                  title="Play/Pause (Space)"
                >
                  {isPlaying ? (
                    <PauseIcon className="h-4 w-4 text-white" />
                  ) : (
                    <PlayIcon className="h-4 w-4 text-white" />
                  )}
                </button>
                
                <button
                  onClick={cyclePlaybackSpeed}
                  className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors"
                  title="Playback speed (click to cycle)"
                >
                  {playbackSpeed}×
                </button>
                
                <div className="text-xs text-gray-600 flex items-center space-x-2">
                  <span>{formatTime(currentTime)}</span>
                  <span className="text-gray-400">/</span>
                  <span>{formatTime(duration)}</span>
                </div>
                
                <div className="text-xs text-gray-500 ml-4">
                  Hold ← to rewind, → to fast-forward
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>

        {/* Vertical Toolbar */}
        <div className="fixed right-0 w-16 bg-white border-l border-gray-200 shadow-lg flex flex-col items-center py-4 space-y-2 z-10" style={{ top: '60px', bottom: '0' }}>
          {/* Undo/Redo */}
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed group"
            title="Undo (Ctrl+Z)"
          >
            <ArrowUturnLeftIcon className="h-5 w-5 text-gray-600" />
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed group"
            title="Redo (Ctrl+Y)"
          >
            <ArrowUturnRightIcon className="h-5 w-5 text-gray-600" />
          </button>
          
          {/* Divider */}
          <div className="w-8 h-px bg-gray-300 my-2"></div>
          
          {/* Zoom controls */}
          <button
            onClick={handleZoomIn}
            className="p-2 rounded-md hover:bg-gray-100 group"
            title="Zoom In (Ctrl+=)"
          >
            <MagnifyingGlassPlusIcon className="h-5 w-5 text-gray-600" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-md hover:bg-gray-100 group"
            title="Zoom Out (Ctrl+-)"
          >
            <MagnifyingGlassMinusIcon className="h-5 w-5 text-gray-600" />
          </button>
          <div className="text-xs text-gray-500 px-1 text-center">
            {Math.round(zoomLevel * 100)}%
          </div>
          
          {/* Divider */}
          <div className="w-8 h-px bg-gray-300 my-2"></div>
          
          {/* Annotation Mode */}
          <button
            onClick={toggleAnnotationMode}
            className={`p-2 rounded-md transition-colors group ${
              isAnnotationMode 
                ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            title="Toggle annotation mode (A)"
          >
            <PencilIcon className="h-5 w-5" />
          </button>
          
          {/* Show/Hide Sidebar */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-2 rounded-md transition-colors group relative ${
              showSidebar 
                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            title={showSidebar ? 'Hide Annotations' : 'Show Annotations'}
          >
            {/* Custom list icon */}
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            {/* Badge with count */}
            {boundingBoxes.length > 0 && (
              <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                {boundingBoxes.length > 9 ? '9+' : boundingBoxes.length}
              </div>
            )}
          </button>
          
        </div>

        {/* Collapsible Sidebar */}
        {showSidebar && (
          <div className="fixed right-16 w-96 border-l border-gray-200 bg-white p-4 overflow-y-auto z-5" style={{ top: '60px', bottom: '0' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Annotations</h2>
              <button
                onClick={() => setShowSidebar(false)}
                className="p-1 rounded-md hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <BoundingBoxList
              boxes={boundingBoxes}
              selectedBox={selectedBox}
              onSelect={setSelectedBox}
              onDelete={handleDeleteBox}
            />
          </div>
        )}
      </div>

      {showLabelModal && (
        <LabelModal
          onClose={() => setShowLabelModal(false)}
          onSave={handleLabelSubmit}
          initialLabel={tempBox?.label || ''}
        />
      )}
      
      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.boxIndex !== undefined ? (
            contextMenu.boxIndex !== undefined
              ? selectedBoxes.size > 1 && selectedBoxes.has(contextMenu.boxIndex)
                ? [
                    {
                      label: `Edit Label for ${selectedBoxes.size} items`,
                      icon: <PencilIcon className="w-4 h-4" />,
                      onClick: handleCustomLabel,
                    },
                    {
                      label: `Copy ${selectedBoxes.size} items`,
                      icon: <ClipboardDocumentIcon className="w-4 h-4" />,
                      onClick: handleCopySelection,
                      shortcut: 'Ctrl+C',
                    },
                    {
                      label: `Delete ${selectedBoxes.size} items`,
                      icon: <TrashIcon className="w-4 h-4" />,
                      onClick: handleDeleteSelectedBoxes,
                      shortcut: 'Del',
                    },
                  ]
                : [
                    {
                      label: 'Edit Label',
                      icon: <PencilIcon className="w-4 h-4" />,
                      onClick: () => handleEditLabel(contextMenu.boxIndex!),
                    },
                    {
                      label: 'Copy',
                      icon: <ClipboardDocumentIcon className="w-4 h-4" />,
                      onClick: handleCopySelection,
                      shortcut: 'Ctrl+C',
                    },
                    {
                      label: 'Delete',
                      icon: <TrashIcon className="w-4 h-4" />,
                      onClick: () => handleDeleteBox(contextMenu.boxIndex!),
                      shortcut: 'Del',
                    },
                  ]
              : clipboardBox
              ? [
                  {
                    label: 'Paste',
                    icon: <ClipboardDocumentIcon className="w-4 h-4" />,
                    onClick: handlePasteSelection,
                    shortcut: 'Ctrl+V',
                  },
                ]
              : []
          }
          onClose={() => setContextMenu(null)}
        />
      )}
      
      {/* Custom Label Input Modal */}
      {showCustomLabelInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium mb-4">
              Set Label for {selectedBoxes.size} Selected Box{selectedBoxes.size > 1 ? 'es' : ''}
            </h3>
            <div className="mb-4">
              <input
                type="text"
                value={customLabelInput}
                onChange={(e) => setCustomLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    applyCustomLabel();
                  } else if (e.key === 'Escape') {
                    setShowCustomLabelInput(false);
                    setCustomLabelInput('');
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter label (or press A-Z for quick labels)"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2">
                Tip: When boxes are selected, you can press A-Z keys directly for quick labeling without this dialog.
              </p>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowCustomLabelInput(false);
                  setCustomLabelInput('');
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={applyCustomLabel}
                className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Apply Label
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnotationEditor;