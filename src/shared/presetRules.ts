// ── Rule-based custom preset form ───────────────────────────────────
export interface RuleState { condition: string; value: string; }
export type ConditionId = 'equals' | 'notEquals' | 'inList' | 'ignore' | 'lt' | 'lte' | 'gt' | 'gte';
export const CONDITION_LABELS: Record<ConditionId, string> = {
  lt: 'Less than', lte: 'Less than or equal to',
  gt: 'Greater than', gte: 'Greater than or equal to',
  equals: 'Equals', notEquals: 'Not equal to',
  inList: 'In List', ignore: 'Ignore',
};
export const DEFAULT_CONDITIONS: ConditionId[] = ['equals', 'notEquals', 'inList', 'ignore'];
export const NUMERIC_CONDITIONS: ConditionId[] = ['lt', 'lte', 'gt', 'gte', 'equals', 'notEquals'];
export interface RuleDef {
  id: string; label: string; category: 'File' | 'Video' | 'Audio';
  dc: ConditionId; dv: string; unit?: string; chips?: string[]; conditions?: ConditionId[];
}
export const RULE_DEFS: RuleDef[] = [
  // File
  { id: 'fileFormat',    label: 'File Format',              category: 'File',  dc: 'inList',  dv: 'mp4, mov',                  unit: '',     chips: ['mp4','mov','mkv','webm','avi','mxf','m2ts'] },
  { id: 'fileExt',       label: 'File Extension',           category: 'File',  dc: 'inList',  dv: 'mp4, mov',                  unit: '',     chips: ['mp4','mov','mkv','webm','avi','mxf','m2ts','ts'] },
  { id: 'fileSize',      label: 'File Size',                category: 'File',  dc: 'lte',     dv: '',                          unit: 'MB',   conditions: NUMERIC_CONDITIONS },
  { id: 'moovAtom',      label: 'MOOV Atom Location',       category: 'File',  dc: 'equals',  dv: 'beginning',                 unit: '',     chips: ['beginning','middle','end'] },
  // Video
  { id: 'videoCodec',    label: 'Video Codec',              category: 'Video', dc: 'inList',  dv: 'h264, hevc',                unit: '',     chips: ['h264','hevc','prores','vp9','av1','dnxhd'] },
  { id: 'videoDims',     label: 'Video Dimensions',         category: 'Video', dc: 'inList',  dv: '1920x1080',                 unit: 'px',   chips: ['1920x1080','3840x2160','1280x720','720x576','720x486'] },
  { id: 'videoAR',       label: 'Video Aspect Ratio',       category: 'Video', dc: 'inList',  dv: '16:9',                      unit: '',     chips: ['16:9','4:3','1:1','9:16','21:9'] },
  { id: 'videoBitDepth', label: 'Video Bit Depth',          category: 'Video', dc: 'gte',     dv: '8',                         unit: 'bit',  chips: ['8','10','12'], conditions: NUMERIC_CONDITIONS },
  { id: 'videoBitRate',  label: 'Video Bit Rate',           category: 'Video', dc: 'lte',     dv: '',                          unit: 'Mbps', conditions: NUMERIC_CONDITIONS },
  { id: 'videoChroma',   label: 'Video Chroma Subsampling', category: 'Video', dc: 'inList',  dv: '4:2:0',                     unit: '',     chips: ['4:2:0','4:2:2','4:4:4'] },
  { id: 'videoColor',    label: 'Video Color Space',        category: 'Video', dc: 'inList',  dv: 'bt709',                     unit: '',     chips: ['bt709','bt2020','bt601','smpte240m'] },
  { id: 'videoDuration', label: 'Video Duration',           category: 'Video', dc: 'lte',     dv: '',                          unit: 's',    conditions: NUMERIC_CONDITIONS },
  { id: 'videoFPS',      label: 'Video Frame Rate',         category: 'Video', dc: 'equals',  dv: '25',                        unit: 'fps',  chips: ['23.976','24','25','29.97','30','50','59.94','60'], conditions: NUMERIC_CONDITIONS },
  { id: 'videoScan',     label: 'Video Scan Type',          category: 'Video', dc: 'equals',  dv: 'progressive',               unit: '',     chips: ['progressive','interlaced'] },
  // Audio
  { id: 'audioCodec',    label: 'Audio Codec',              category: 'Audio', dc: 'inList',  dv: 'aac',                       unit: '',     chips: ['aac','mp3','pcm_s16le','pcm_s24le','ac3','eac3'] },
  { id: 'audioChannels', label: 'Audio Channels',           category: 'Audio', dc: 'equals',  dv: '2',                         unit: '',     chips: ['1','2','6','8'],          conditions: NUMERIC_CONDITIONS },
  { id: 'audioSR',       label: 'Audio Sample Rate',        category: 'Audio', dc: 'equals',  dv: '48000',                     unit: 'Hz',   chips: ['44100','48000','96000'],  conditions: NUMERIC_CONDITIONS },
  { id: 'audioLoudness', label: 'Audio Loudness',           category: 'Audio', dc: 'lte',     dv: '-23',                       unit: 'LUFS', chips: ['-23','-24','-16','-18'], conditions: NUMERIC_CONDITIONS },
  { id: 'audioTP',       label: 'Audio True Peak',          category: 'Audio', dc: 'lte',     dv: '-1',                        unit: 'dBTP', chips: ['-1','-2','-3'],           conditions: NUMERIC_CONDITIONS },
  { id: 'audioBR',       label: 'Audio Bit Rate',           category: 'Audio', dc: 'gte',     dv: '128',                       unit: 'kbps', chips: ['128','192','256','320'],  conditions: NUMERIC_CONDITIONS },
];

export const makeDefaultRules = (): Record<string, RuleState> =>
  Object.fromEntries(RULE_DEFS.map(d => [d.id, { condition: 'ignore', value: d.dv }]));

export interface CustomPresetForm { name: string; rules: Record<string, RuleState>; }
export const defaultForm: CustomPresetForm = { name: '', rules: makeDefaultRules() };
