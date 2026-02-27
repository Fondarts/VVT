import type { ValidationReport, ValidationCheck } from '../shared/types';

let _jsPDF: typeof import('jspdf')['jsPDF'] | null = null;

export async function preloadPdf(): Promise<void> {
  if (_jsPDF) return;
  const mod = await import('jspdf');
  _jsPDF = mod.jsPDF;
}

async function getJsPDF(): Promise<typeof import('jspdf')['jsPDF']> {
  if (!_jsPDF) await preloadPdf();
  return _jsPDF!;
}

// ── helpers ────────────────────────────────────────────────────

/**
 * Load an image from a URL (Blob URL, data URL, or https URL).
 * In the web version, thumbnails are already Blob URLs — no file:// needed.
 */
const loadImageAsBase64 = (src: string): Promise<string | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const aspectRatioStr = (w: number, h: number): string => {
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
};

// ── constants ──────────────────────────────────────────────────

const NAVY:     [number, number, number] = [10, 26, 68];
const WHITE:    [number, number, number] = [255, 255, 255];
const LIGHT_BG: [number, number, number] = [245, 247, 252];
const MUTED:    [number, number, number] = [100, 110, 130];
const DARK:     [number, number, number] = [20, 30, 50];

const STATUS_COLORS: Record<string, [number, number, number]> = {
  pass: [22, 163, 74],
  warn: [202, 100, 10],
  fail: [210, 35, 35],
  info: [130, 140, 160],
};

// ── main export ────────────────────────────────────────────────

export const generatePDF = async (
  report: ValidationReport,
  outputPath: string
): Promise<void> => {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF('p', 'mm', 'a4');
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M  = 14;
  const CW = PW - M * 2;
  let y = 0;

  doc.setProperties({ title: 'Kissd Video Validation Tool' });

  const pb = (needed = 20) => {
    if (y + needed > PH - M) {
      doc.addPage();
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, PW, 8, 'F');
      doc.setTextColor(...WHITE);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.text('KISSD VIDEO VALIDATION TOOL', M, 5.5);
      y = 14;
    }
  };

  const sectionBar = (title: string) => {
    pb(12);
    doc.setFillColor(...NAVY);
    doc.rect(M, y, CW, 8, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(title, M + 4, y + 5.5);
    y += 11;
  };

  const txt = (
    text: string,
    x: number,
    ty: number,
    size: number,
    style: 'normal' | 'bold',
    color: [number, number, number]
  ) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    doc.setTextColor(...color);
    doc.text(text, x, ty);
  };

  // PAGE HEADER
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, PW, 16, 'F');
  txt('KISSD VIDEO VALIDATION TOOL', M, 10, 9, 'bold', [220, 30, 30]);
  y = 22;

  // FILE SUMMARY
  const failCount = report.checks.filter(c => c.status === 'fail').length;
  const warnCount = report.checks.filter(c => c.status === 'warn').length;
  const resultText = failCount > 0
    ? `${failCount} TEST${failCount !== 1 ? 'S' : ''} FAILED`
    : warnCount > 0
      ? `${warnCount} WARNING${warnCount !== 1 ? 'S' : ''}`
      : 'ALL CHECKS PASSED';
  const resultColor: [number, number, number] = failCount > 0 ? [210, 35, 35]
    : warnCount > 0 ? [202, 100, 10]
    : [22, 163, 74];

  doc.setFillColor(...LIGHT_BG);
  doc.rect(M, y, CW, 16, 'F');

  const fileName = report.file.name.length > 50
    ? report.file.name.substring(0, 48) + '…'
    : report.file.name;
  txt(fileName, M + 4, y + 6, 8.5, 'bold', DARK);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...resultColor);
  doc.text(resultText, PW - M - doc.getTextWidth(resultText) - 4, y + 6);

  const meta = [
    report.file.sizeFormatted,
    report.file.durationFormatted,
    `${report.detected.video.width}×${report.detected.video.height}`,
    new Date(report.timestamp).toLocaleDateString(),
  ].join('  ·  ');
  txt(meta, M + 4, y + 12, 6.5, 'normal', MUTED);
  y += 20;

  // THUMBNAILS
  if (report.thumbnails.length > 0) {
    const thumbs = report.thumbnails.slice(0, 10);
    const vidAsp = report.detected.video.width / report.detected.video.height;
    const GAP    = 2;
    const MAX_H  = 100;

    let bigW = (CW - GAP) / 2;
    let bigH = bigW / vidAsp;

    if (bigH > MAX_H) {
      bigH = MAX_H;
      bigW = bigH * vidAsp;
    }

    const rightAreaW = bigW;
    const rightAreaH = bigH;
    const totalBlockW = bigW + GAP + rightAreaW;
    const blockX = M + (CW - totalBlockW) / 2;

    const COLS = 3, ROWS = 3;
    const smallW = (rightAreaW - (COLS - 1) * GAP) / COLS;
    const smallH = (rightAreaH - (ROWS - 1) * GAP) / ROWS;

    pb(bigH + 16);
    sectionBar(`THUMBNAILS  (${thumbs.length} frames)`);

    const b64_0 = await loadImageAsBase64(thumbs[0]);
    if (b64_0) { doc.addImage(b64_0, 'JPEG', blockX, y, bigW, bigH); }
    else { doc.setFillColor(200, 210, 225); doc.rect(blockX, y, bigW, bigH, 'F'); }
    doc.setFillColor(20, 20, 20);
    doc.roundedRect(blockX + bigW - 8, y + bigH - 5, 7, 4, 1, 1, 'F');
    txt('1', blockX + bigW - 7, y + bigH - 2, 5, 'bold', WHITE);

    const rxStart = blockX + bigW + GAP;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const idx = row * COLS + col;
        const tx  = rxStart + col * (smallW + GAP);
        const ty  = y + row * (smallH + GAP);

        if (idx + 1 < thumbs.length) {
          const b64 = await loadImageAsBase64(thumbs[idx + 1]);
          if (b64) { doc.addImage(b64, 'JPEG', tx, ty, smallW, smallH); }
          else { doc.setFillColor(200, 210, 225); doc.rect(tx, ty, smallW, smallH, 'F'); }
          doc.setFillColor(20, 20, 20);
          doc.roundedRect(tx + smallW - 8, ty + smallH - 5, 7, 4, 1, 1, 'F');
          txt(`${idx + 2}`, tx + smallW - 7, ty + smallH - 2, 5, 'bold', WHITE);
        } else {
          doc.setFillColor(235, 237, 243);
          doc.rect(tx, ty, smallW, smallH, 'F');
        }
      }
    }

    y += bigH + 6;
  }

  // FILE PROPERTIES
  pb(40);
  sectionBar('FILE PROPERTIES');

  type PropStatus = 'info' | 'pass' | 'warn' | 'fail';
  interface PropRow   { name: string; value: string; status: PropStatus }
  interface PropGroup { title: string; rows: PropRow[] }

  const checkMap = new Map(report.checks.map(c => [c.id, c]));
  const cs = (...ids: string[]): PropStatus => {
    const st = ids.map(id => checkMap.get(id)?.status).filter(Boolean) as string[];
    if (st.includes('fail')) return 'fail';
    if (st.includes('warn')) return 'warn';
    if (st.includes('pass')) return 'pass';
    return 'info';
  };

  const vid = report.detected.video;

  const propGroups: PropGroup[] = [
    {
      title: 'CONTAINER',
      rows: [
        { name: 'File Name',      value: report.file.name,                                              status: 'info' },
        { name: 'File Extension', value: report.file.extension,                                          status: 'info' },
        { name: 'Format',         value: report.file.container.toUpperCase(),                            status: cs('container-format') },
        { name: 'Format Profile', value: report.file.formatProfile || 'N/A',                            status: 'info' },
        { name: 'File Size',      value: report.file.sizeFormatted,                                      status: cs('file-size') },
        { name: 'Duration',       value: report.file.durationFormatted,                                  status: cs('duration') },
        { name: 'Fast Start',     value: report.detected.fastStart.enabled ? 'Enabled' : 'Disabled',    status: cs('fast-start') },
        { name: 'Creation Date',  value: report.file.creationDate || 'N/A',                              status: 'info' },
      ],
    },
    {
      title: 'VIDEO',
      rows: [
        { name: 'Format',               value: vid.format || vid.codec.toUpperCase(),                                  status: 'info' },
        { name: 'Format Version',       value: vid.formatVersion || 'N/A',                                             status: 'info' },
        { name: 'Format Profile',       value: vid.profile || 'N/A',                                                   status: 'info' },
        { name: 'Codec',                value: vid.codec.toUpperCase(),                                                 status: cs('video-codec') },
        { name: 'Codec ID',             value: vid.codecId || 'N/A',                                                   status: 'info' },
        { name: 'Resolution',           value: `${vid.width} × ${vid.height}`,                                         status: cs('resolution') },
        { name: 'Display Aspect Ratio', value: vid.displayAspectRatio || aspectRatioStr(vid.width, vid.height),        status: cs('aspect-ratio') },
        { name: 'Frame Rate',           value: `${vid.frameRateFormatted} fps`,                                        status: cs('frame-rate') },
        { name: 'Frame Rate Mode',      value: vid.frameRateMode || 'N/A',                                             status: 'info' },
        { name: 'Bit Rate',             value: vid.bitRateFormatted,                                                    status: cs('max-bitrate', 'min-bitrate') },
        { name: 'Chroma',               value: vid.chromaSubsampling,                                                  status: cs('chroma-subsampling') },
        { name: 'Scan Type',            value: vid.scanType,                                                            status: cs('scan-type') },
        { name: 'Bit Depth',            value: vid.bitDepth ? `${vid.bitDepth}-bit` : 'N/A',                          status: cs('bit-depth') },
        { name: 'Color Space',          value: vid.colorSpace || 'N/A',                                                status: cs('color-space') },
        { name: 'Color Range',          value: vid.colorRange || 'N/A',                                                status: 'info' },
        { name: 'Color Primaries',      value: vid.colorPrimaries || 'N/A',                                            status: 'info' },
      ],
    },
  ];

  if (report.detected.audio) {
    const aud = report.detected.audio;
    propGroups.push({
      title: 'AUDIO',
      rows: [
        { name: 'Codec',            value: aud.codec.toUpperCase(),                                        status: cs('audio-codec') },
        { name: 'Compression Mode', value: aud.compressionMode || 'N/A',                                  status: 'info' },
        { name: 'Sample Rate',      value: `${aud.sampleRate} Hz`,                                         status: cs('audio-sample-rate') },
        { name: 'Channels',         value: `${aud.channels} (${aud.channelLayout})`,                      status: cs('audio-channels') },
        { name: 'Bit Depth',        value: aud.bitDepth ? `${aud.bitDepth}-bit` : 'N/A',                 status: 'info' },
        { name: 'Loudness',         value: `${aud.lufs.toFixed(1)} LUFS`,                                 status: cs('audio-lufs') },
        { name: 'True Peak',        value: `${aud.truePeak.toFixed(1)} dBTP`,                             status: cs('audio-truepeak') },
      ],
    });
  }

  const pcolW = (CW - 2) / 2;
  const prowH = 7.5;
  const subHdrH = 7;

  for (const group of propGroups) {
    // Group sub-header
    pb(subHdrH + prowH + 2);
    doc.setFillColor(30, 45, 85);
    doc.rect(M, y, CW, subHdrH, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text(group.title, M + 4, y + subHdrH - 1.8);
    y += subHdrH + 2;

    for (let ri = 0; ri < Math.ceil(group.rows.length / 2); ri++) {
      pb(prowH + 2);
      if (ri % 2 === 0) { doc.setFillColor(...LIGHT_BG); doc.rect(M, y - 1.5, CW, prowH, 'F'); }

      for (let ci = 0; ci < 2; ci++) {
        const idx = ri * 2 + ci;
        if (idx >= group.rows.length) continue;

        const { name, value, status } = group.rows[idx];
        const px   = M + ci * (pcolW + 2);
        const rowY = y + prowH / 2 + 0.5;

        const dotColor = STATUS_COLORS[status];
        if (status === 'info') {
          doc.setDrawColor(...dotColor);
          doc.setLineWidth(0.4);
          doc.circle(px + 2.5, rowY - 1, 1.5, 'S');
        } else {
          doc.setFillColor(...dotColor);
          doc.circle(px + 2.5, rowY - 1, 1.5, 'F');
        }

        txt(name, px + 7, rowY + 0.5, 7.5, 'normal', MUTED);

        const valColor: [number, number, number] = status === 'warn' ? [180, 80, 10]
          : status === 'fail' ? [200, 30, 30]
          : DARK;

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...valColor);
        let displayVal = value;
        while (doc.getTextWidth(displayVal) > pcolW - 45 && displayVal.length > 4) {
          displayVal = displayVal.slice(0, -4) + '…';
        }
        doc.text(displayVal, px + pcolW - doc.getTextWidth(displayVal) - 1, rowY + 0.5);
      }

      y += prowH;
    }
    y += 5;
  }

  y += 4;

  // VALIDATION CHECKS
  if (report.checks.length > 0) {
    pb(40);
    const barTitle = report.presetUsed
      ? `VALIDATION CHECKS — ${report.presetUsed.toUpperCase()}`
      : 'VALIDATION CHECKS';
    sectionBar(barTitle);

    const catNames: Record<string, string> = { container: 'Container', video: 'Video', audio: 'Audio' };
    const checksByCat: Record<string, ValidationCheck[]> = {};
    report.checks.forEach(c => {
      if (!checksByCat[c.category]) checksByCat[c.category] = [];
      checksByCat[c.category].push(c);
    });

    for (const [cat, catChecks] of Object.entries(checksByCat)) {
      pb(12);
      txt(catNames[cat] || cat, M, y + 3.5, 8.5, 'bold', MUTED);
      y += 8;

      catChecks.forEach((check, idx) => {
        pb(11);
        if (idx % 2 === 0) { doc.setFillColor(...LIGHT_BG); doc.rect(M, y - 1.5, CW, 9.5, 'F'); }

        const cc = STATUS_COLORS[check.status] || STATUS_COLORS.info;
        doc.setFillColor(...(cc as [number, number, number]));
        doc.circle(M + 3, y + 3.5, 2, 'F');

        txt(check.name, M + 8, y + 5, 8, 'normal', DARK);

        if (check.expected) {
          txt(`Expected: ${check.expected}`, PW / 2 - 15, y + 5, 7, 'normal', MUTED);
        }

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(cc as [number, number, number]));
        const dTxt = check.detected;
        doc.text(dTxt, PW - M - doc.getTextWidth(dTxt), y + 5);

        y += 9.5;
      });

      y += 4;
    }
  }

  // AUDIO WAVEFORM
  if (report.audioWaveform && report.audioWaveform.length > 0) {
    const wH = 20;
    pb(wH + 20);
    sectionBar('AUDIO WAVEFORM');

    doc.setFillColor(...LIGHT_BG);
    doc.rect(M, y, CW, wH, 'F');

    const data = report.audioWaveform;
    const step = CW / data.length;
    const cy   = y + wH / 2;

    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.25);
    for (let i = 0; i < data.length; i++) {
      const amp = data[i] * (wH / 2 - 2);
      const x   = M + i * step;
      doc.line(x, cy - amp, x, cy + amp);
    }

    doc.setDrawColor(130, 150, 190);
    doc.setLineWidth(0.15);
    doc.line(M, cy, M + CW, cy);

    txt('00:00:00.00', M, y + wH + 5, 6.5, 'normal', MUTED);
    const durTxt = report.file.durationFormatted;
    doc.setFontSize(6.5);
    doc.text(durTxt, M + CW - doc.getTextWidth(durTxt), y + wH + 5);

    y += wH + 10;
  }

  // TRANSCRIPTION
  if (report.transcription && report.transcription.segments.length > 0) {
    pb(40);
    sectionBar('AUDIO TRANSCRIPTION');

    const segRowH = 7.5;
    const tsColW  = 28;

    report.transcription.segments.forEach((seg, idx) => {
      pb(segRowH + 2);
      if (idx % 2 === 0) { doc.setFillColor(...LIGHT_BG); doc.rect(M, y - 1.5, CW, segRowH, 'F'); }

      const rowY = y + segRowH / 2 + 0.5;
      const from = seg.from;
      const totalSec = Math.floor(from / 1000);
      const mm  = Math.floor(totalSec / 60);
      const ss  = totalSec % 60;
      const ff  = Math.floor((from % 1000) / 10);
      const ts  = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ff).padStart(2, '0')}`;

      txt(ts, M + 2, rowY, 7, 'bold', ([80, 130, 200] as [number, number, number]));

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK);
      let segText = seg.text;
      const maxW = CW - tsColW - 4;
      while (doc.getTextWidth(segText) > maxW && segText.length > 4) {
        segText = segText.slice(0, -4) + '…';
      }
      doc.text(segText, M + tsColW, rowY);

      y += segRowH;
    });

    y += 6;
  }

  // FOOTER
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...NAVY);
    doc.rect(0, PH - 11, PW, 11, 'F');
    doc.setTextColor(...([160, 185, 225] as [number, number, number]));
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Page ${i} of ${totalPages}  ·  Kissd Video Validation Tool  ·  ${new Date(report.timestamp).toLocaleDateString()}`,
      PW / 2, PH - 4.5,
      { align: 'center' }
    );
  }

  // In web, trigger a download instead of saving to disk
  doc.save(outputPath.split('/').pop() || 'report.pdf');
};

// ── JSON export ────────────────────────────────────────────────

export const generateJSON = async (
  report: ValidationReport,
  outputPath: string
): Promise<void> => {
  const dataStr = JSON.stringify(report, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = outputPath.split('/').pop() || 'report.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
