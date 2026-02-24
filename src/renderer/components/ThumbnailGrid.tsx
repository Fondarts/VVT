import React, { useState, useCallback } from 'react';
import { Image, ChevronDown, ChevronUp, Download } from 'lucide-react';

interface ThumbnailGridProps {
  thumbnails: string[];
}

export const ThumbnailGrid: React.FC<ThumbnailGridProps> = ({ thumbnails }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleSave = useCallback(async (thumbPath: string, index: number) => {
    const destPath = await window.electronAPI.dialog.saveFilePath(`thumbnail_${index + 1}.jpg`);
    if (!destPath) return;
    await window.electronAPI.file.saveFile(thumbPath, destPath);
  }, []);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title" style={{ fontSize: '0.875rem' }}>
          <Image size={14} style={{ marginRight: '8px', display: 'inline' }} />
          Thumbnails ({thumbnails.length})
        </h3>
        <button className="btn btn-icon btn-sm" onClick={() => setCollapsed(c => !c)}>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
      {!collapsed && <div className="card-content" style={{ padding: '12px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
        }}>
          {thumbnails.map((thumb, index) => (
            <div
              key={index}
              style={{
                aspectRatio: '16/9',
                borderRadius: '4px',
                overflow: 'hidden',
                background: 'var(--color-bg-tertiary)',
                position: 'relative',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => handleSave(thumb, index)}
            >
              <img
                src={`file://${thumb}`}
                alt={`Thumbnail ${index + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {/* Number badge */}
              <div style={{
                position: 'absolute',
                bottom: '4px',
                right: '4px',
                background: 'rgba(0,0,0,0.7)',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '0.625rem',
                fontFamily: 'var(--font-mono)',
              }}>
                {index + 1}
              </div>
              {/* Hover download overlay */}
              {hoveredIndex === index && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.55)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  color: 'white',
                }}>
                  <Download size={18} />
                  <span style={{ fontSize: '0.6rem', fontWeight: 600 }}>Save</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
};
