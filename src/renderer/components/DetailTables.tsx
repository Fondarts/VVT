import React, { useState } from 'react';
import { FileText, Video, Volume2, HardDrive } from 'lucide-react';
import type { ScanResult } from '../../shared/types';

interface DetailTablesProps {
  scanResult: ScanResult;
}

export const DetailTables: React.FC<DetailTablesProps> = ({ scanResult }) => {
  const [activeTab, setActiveTab] = useState<'file' | 'video' | 'audio'>('file');

  const renderFileDetails = () => (
    <table>
      <tbody>
        <tr>
          <td>File Name</td>
          <td>{scanResult.file.name}</td>
        </tr>
        <tr>
          <td>Container</td>
          <td>{scanResult.file.container.toUpperCase()}</td>
        </tr>
        <tr>
          <td>Duration</td>
          <td>{scanResult.file.durationFormatted}</td>
        </tr>
        <tr>
          <td>File Size</td>
          <td>{scanResult.file.sizeFormatted}</td>
        </tr>
        <tr>
          <td>Fast Start</td>
          <td>{scanResult.fastStart.enabled ? 'Enabled' : 'Disabled'}</td>
        </tr>
        <tr>
          <td>Hash (MD5)</td>
          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem' }}>
            {scanResult.file.hash?.slice(0, 16)}...
          </td>
        </tr>
      </tbody>
    </table>
  );

  const renderVideoDetails = () => (
    <table>
      <tbody>
        <tr>
          <td>Codec</td>
          <td>{scanResult.video.codec.toUpperCase()}</td>
        </tr>
        <tr>
          <td>Profile</td>
          <td>{scanResult.video.profile || 'N/A'}</td>
        </tr>
        <tr>
          <td>Resolution</td>
          <td>{scanResult.video.width} x {scanResult.video.height}</td>
        </tr>
        <tr>
          <td>Frame Rate</td>
          <td>{scanResult.video.frameRateFormatted} fps</td>
        </tr>
        <tr>
          <td>Bit Rate</td>
          <td>{scanResult.video.bitRateFormatted}</td>
        </tr>
        <tr>
          <td>Chroma Subsampling</td>
          <td>{scanResult.video.chromaSubsampling}</td>
        </tr>
        <tr>
          <td>Scan Type</td>
          <td>{scanResult.video.scanType}</td>
        </tr>
        <tr>
          <td>Color Space</td>
          <td>{scanResult.video.colorSpace || 'N/A'}</td>
        </tr>
        <tr>
          <td>Color Range</td>
          <td>{scanResult.video.colorRange || 'N/A'}</td>
        </tr>
        <tr>
          <td>Color Primaries</td>
          <td>{scanResult.video.colorPrimaries || 'N/A'}</td>
        </tr>
        <tr>
          <td>Color Transfer</td>
          <td>{scanResult.video.colorTransfer || 'N/A'}</td>
        </tr>
      </tbody>
    </table>
  );

  const renderAudioDetails = () => {
    if (!scanResult.audio) {
      return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>No audio stream detected</div>;
    }

    return (
      <table>
        <tbody>
          <tr>
            <td>Codec</td>
            <td>{scanResult.audio.codec.toUpperCase()}</td>
          </tr>
          <tr>
            <td>Sample Rate</td>
            <td>{scanResult.audio.sampleRate} Hz</td>
          </tr>
          <tr>
            <td>Channels</td>
            <td>{scanResult.audio.channels} ({scanResult.audio.channelLayout})</td>
          </tr>
          <tr>
            <td>Bit Depth</td>
            <td>{scanResult.audio.bitDepth ? `${scanResult.audio.bitDepth}-bit` : 'N/A'}</td>
          </tr>
          <tr>
            <td>Integrated Loudness (LUFS)</td>
            <td style={{ 
              color: scanResult.audio.lufs >= -16 && scanResult.audio.lufs <= -14 
                ? 'var(--color-success)' 
                : 'var(--color-warning)'
            }}>
              {scanResult.audio.lufs} LUFS
            </td>
          </tr>
          <tr>
            <td>True Peak (dBTP)</td>
            <td style={{ 
              color: scanResult.audio.truePeak <= -1.0 
                ? 'var(--color-success)' 
                : 'var(--color-error)'
            }}>
              {scanResult.audio.truePeak} dBTP
            </td>
          </tr>
        </tbody>
      </table>
    );
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title" style={{ fontSize: '0.875rem' }}>
          <HardDrive size={14} style={{ marginRight: '8px', display: 'inline' }} />
          Details
        </h3>
      </div>
      <div className="card-content" style={{ padding: '12px' }}>
        <div className="tab-nav" style={{ marginBottom: '12px' }}>
          <button
            className={`tab-btn ${activeTab === 'file' ? 'active' : ''}`}
            onClick={() => setActiveTab('file')}
          >
            <FileText size={12} style={{ marginRight: '4px', display: 'inline' }} />
            File
          </button>
          <button
            className={`tab-btn ${activeTab === 'video' ? 'active' : ''}`}
            onClick={() => setActiveTab('video')}
          >
            <Video size={12} style={{ marginRight: '4px', display: 'inline' }} />
            Video
          </button>
          <button
            className={`tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
            onClick={() => setActiveTab('audio')}
          >
            <Volume2 size={12} style={{ marginRight: '4px', display: 'inline' }} />
            Audio
          </button>
        </div>

        {activeTab === 'file' && renderFileDetails()}
        {activeTab === 'video' && renderVideoDetails()}
        {activeTab === 'audio' && renderAudioDetails()}
      </div>
    </div>
  );
};