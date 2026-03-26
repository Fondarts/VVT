import React, { useState } from 'react';
import { Clapperboard, ChevronDown, ChevronUp } from 'lucide-react';
import { SlateCreator } from './SlateCreator';
import type { TimelineBlock } from './EditTimeline';

interface Props {
  videoFile: File | null;
  onAddSlateBlock: (block: TimelineBlock) => void;
  forceOpen?: number;
  videoWidth?: number;
  videoHeight?: number;
}

export const SlateCreatorCollapsible: React.FC<Props> = ({ videoFile, onAddSlateBlock, forceOpen, videoWidth, videoHeight }) => {
  const [collapsed, setCollapsed] = useState(true);
  React.useEffect(() => { if (forceOpen) setCollapsed(false); }, [forceOpen]);
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title" style={{ fontSize: '0.875rem' }}>
          <Clapperboard size={14} style={{ marginRight: '8px', display: 'inline' }} />
          Slate Creator
        </h3>
        <button className="btn btn-icon btn-sm" onClick={() => setCollapsed(c => !c)}>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
      {!collapsed && (
        <div style={{ padding: '12px' }}>
          <SlateCreator videoFile={videoFile} onAddSlateBlock={onAddSlateBlock} videoWidth={videoWidth} videoHeight={videoHeight} />
        </div>
      )}
    </div>
  );
};
