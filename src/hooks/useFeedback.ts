import { useState, useCallback } from 'react';
import type { AnnotationStroke } from '../shared/types';
import { updateCommentTimecode, updateCommentRange, updateCommentTimecodes } from '../utils/feedbackStorage';
import type { VideoPlayerHandle } from '../components/VideoPlayer';

export interface UseFeedbackReturn {
  feedbackCount: number;
  setFeedbackCount: React.Dispatch<React.SetStateAction<number>>;
  feedbackMarkers: { time: number; id: string; author: string }[];
  setFeedbackMarkers: React.Dispatch<React.SetStateAction<{ time: number; id: string; author: string }[]>>;
  feedbackMarkerRanges: { start: number; end: number; id: string; author: string }[];
  setFeedbackMarkerRanges: React.Dispatch<React.SetStateAction<{ start: number; end: number; id: string; author: string }[]>>;
  stagedMarker: { start: number; end: number; strokes?: AnnotationStroke[] } | null;
  setStagedMarker: React.Dispatch<React.SetStateAction<{ start: number; end: number; strokes?: AnnotationStroke[] } | null>>;
  annotationOverlay: AnnotationStroke[] | null;
  setAnnotationOverlay: React.Dispatch<React.SetStateAction<AnnotationStroke[] | null>>;
  handlePlaceMarker: (start: number, end: number, strokes: AnnotationStroke[]) => void;
  handleImagePlaceMarker: (strokes: AnnotationStroke[]) => void;
  handleMarkerMove: (id: string, newTime: number) => void;
  handleMarkerRangeMove: (id: string, newStart: number, newEnd: number) => void;
  handleMarkerSetRange: (id: string, end: number) => void;
  resetFeedback: () => void;
}

export function useFeedback(
  selectedFile: File | null,
  videoPlayerRef: React.RefObject<VideoPlayerHandle | null>,
  setActiveRightTab: (tab: 'specs' | 'feedback' | 'tools') => void,
): UseFeedbackReturn {
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [feedbackMarkers, setFeedbackMarkers] = useState<{ time: number; id: string; author: string }[]>([]);
  const [feedbackMarkerRanges, setFeedbackMarkerRanges] = useState<{ start: number; end: number; id: string; author: string }[]>([]);
  const [stagedMarker, setStagedMarker] = useState<{ start: number; end: number; strokes?: AnnotationStroke[] } | null>(null);
  const [annotationOverlay, setAnnotationOverlay] = useState<AnnotationStroke[] | null>(null);

  const handlePlaceMarker = useCallback((start: number, end: number, strokes: AnnotationStroke[]) => {
    videoPlayerRef.current?.seekTo(start * 1000);
    setStagedMarker({ start, end, strokes: strokes.length > 0 ? strokes : undefined });
    setActiveRightTab('feedback');
  }, [videoPlayerRef, setActiveRightTab]);

  const handleImagePlaceMarker = useCallback((strokes: AnnotationStroke[]) => {
    setStagedMarker({ start: 0, end: 0, strokes: strokes.length > 0 ? strokes : undefined });
    setActiveRightTab('feedback');
  }, [setActiveRightTab]);

  const handleMarkerMove = useCallback((id: string, newTime: number) => {
    if (!selectedFile) return;
    updateCommentTimecode(id, newTime);
    setFeedbackMarkers(prev => prev.map(m => m.id === id ? { ...m, time: newTime } : m));
  }, [selectedFile]);

  const handleMarkerRangeMove = useCallback((id: string, newStart: number, newEnd: number) => {
    if (!selectedFile) return;
    updateCommentTimecodes(id, newStart, newEnd);
    setFeedbackMarkerRanges(prev => prev.map(r => r.id === id ? { ...r, start: newStart, end: newEnd } : r));
  }, [selectedFile]);

  const handleMarkerSetRange = useCallback((id: string, end: number) => {
    if (!selectedFile) return;
    updateCommentRange(id, end);
  }, [selectedFile]);

  const resetFeedback = useCallback(() => {
    setFeedbackCount(0);
    setFeedbackMarkers([]);
    setFeedbackMarkerRanges([]);
    setStagedMarker(null);
    setAnnotationOverlay(null);
  }, []);

  return {
    feedbackCount,
    setFeedbackCount,
    feedbackMarkers,
    setFeedbackMarkers,
    feedbackMarkerRanges,
    setFeedbackMarkerRanges,
    stagedMarker,
    setStagedMarker,
    annotationOverlay,
    setAnnotationOverlay,
    handlePlaceMarker,
    handleImagePlaceMarker,
    handleMarkerMove,
    handleMarkerRangeMove,
    handleMarkerSetRange,
    resetFeedback,
  };
}
