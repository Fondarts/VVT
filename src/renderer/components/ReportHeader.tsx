import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Calendar, HardDrive, Video } from 'lucide-react';
import type { FileMetadata, VideoMetadata } from '../../shared/types';

interface ReportHeaderProps {
  file: FileMetadata;
  video: VideoMetadata;
  result: 'COMPLIANT' | 'NON-COMPLIANT' | 'WARNINGS';
}

const resultConfig = {
  'COMPLIANT': {
    icon: <CheckCircle2 size={32} />,
    color: 'var(--color-success)',
    bgColor: 'rgba(34, 197, 94, 0.15)',
    label: 'COMPLIANT',
  },
  'NON-COMPLIANT': {
    icon: <AlertCircle size={32} />,
    color: 'var(--color-error)',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    label: 'NON-COMPLIANT',
  },
  'WARNINGS': {
    icon: <AlertTriangle size={32} />,
    color: 'var(--color-warning)',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    label: 'WARNINGS',
  },
};

export const ReportHeader: React.FC<ReportHeaderProps> = ({ file, video, result }) => {
  const config = resultConfig[result];
  const timestamp = new Date().toLocaleString();

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ 
        display: 'flex',
        alignItems: 'stretch',
      }}>
        {/* Result indicator */}
        <div style={{
          width: '120px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: config.bgColor,
          color: config.color,
          padding: '20px',
        }}>
          {config.icon}
          <span style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginTop: '8px',
          }}>
            {config.label}
          </span>
        </div>

        {/* Info */}
        <div style={{
          flex: 1,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}>
          <h2 style={{
            fontSize: '1.125rem',
            fontWeight: 600,
            margin: '0 0 12px 0',
            wordBreak: 'break-all',
          }}>
            {file.name}
          </h2>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            fontSize: '0.8125rem',
            color: 'var(--color-text-secondary)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={14} />
              {timestamp}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <HardDrive size={14} />
              {file.sizeFormatted}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Video size={14} />
              {video.width} x {video.height}
            </span>
            <span style={{ color: 'var(--color-text-muted)' }}>
              Creative type: Video
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};