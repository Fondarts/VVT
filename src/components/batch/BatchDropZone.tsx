import React, { useRef, useState } from 'react';
import { FileVideo } from 'lucide-react';

interface BatchDropZoneProps {
  onFiles: (files: File[]) => void;
  compact?: boolean;
}

export const BatchDropZone: React.FC<BatchDropZoneProps> = ({ onFiles, compact = false }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const videoFiles = Array.from(files).filter(f =>
      f.type.startsWith('video/') ||
      /\.(mp4|mov|mkv|webm|avi|mxf|m2ts|ts)$/i.test(f.name)
    );
    if (videoFiles.length) onFiles(videoFiles);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.mov,.mkv,.webm,.avi,.mxf,.m2ts,.ts"
        multiple
        style={{ display: 'none' }}
        onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
      />
      <div
        className={`dropzone${isDragOver ? ' drag-over' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={e => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
        style={compact ? { padding: '12px 20px', marginBottom: 12 } : { marginBottom: 12 }}
      >
        <FileVideo size={compact ? 24 : 40} />
        {!compact && <h3>Drop multiple video files</h3>}
        <p style={{ fontSize: '0.8rem' }}>
          {compact ? 'Add more files' : 'Click or drag and drop — up to 2 will scan simultaneously'}
        </p>
      </div>
    </>
  );
};
