/**
 * WhisperX runner — executes WhisperX via Python subprocess.
 *
 * WhisperX provides:
 *  - Whisper transcription (any model size)
 *  - Silero VAD (filters silence/music before transcription)
 *  - wav2vec2 forced alignment (precise word-level timestamps)
 *
 * All in one call, with much better quality than our manual implementation.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let pythonCmd = null; // 'python', 'python3', or full path

/**
 * Find a working Python ≥ 3.8 command.
 */
function findPython() {
  if (pythonCmd) return pythonCmd;
  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py -3']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const ver = execSync(`${cmd} --version 2>&1`, { encoding: 'utf8', timeout: 5000 }).trim();
      const m = ver.match(/Python (\d+)\.(\d+)/);
      if (m && (Number(m[1]) > 3 || (Number(m[1]) === 3 && Number(m[2]) >= 10))) {
        pythonCmd = cmd;
        console.log(`[WhisperX] Found Python: ${ver} (${cmd})`);
        return pythonCmd;
      }
    } catch {}
  }
  return null;
}

/**
 * Check if whisperx is installed.
 */
function isInstalled() {
  const py = findPython();
  if (!py) return { python: false, whisperx: false };
  try {
    execSync(`${py} -c "import whisperx; print('ok')" 2>&1`, {
      encoding: 'utf8', timeout: 15000,
    });
    return { python: true, whisperx: true };
  } catch {
    return { python: true, whisperx: false };
  }
}

/**
 * Get install command for the user.
 */
function getInstallCommand() {
  const py = findPython() || 'python';
  // pip install with PyTorch CPU by default (smaller). User can install CUDA version manually.
  return `${py} -m pip install whisperx`;
}

/**
 * Run WhisperX transcription on an audio file.
 *
 * @param {string} audioPath - Path to audio/video file
 * @param {object} opts
 * @param {string} opts.model - Whisper model size: tiny, base, small, medium, large-v3
 * @param {string} opts.language - Language code or 'auto'
 * @param {string} opts.outputDir - Temp directory for output
 * @param {function} opts.onProgress - Progress callback (status string)
 * @returns {Promise<{words: Array<{word, start, end}>, segments: Array<{text, start, end}>, language: string}>}
 */
function transcribe(audioPath, opts = {}) {
  const {
    model = 'base',
    language = 'auto',
    outputDir = os.tmpdir(),
    onProgress,
  } = opts;

  const py = findPython();
  if (!py) return Promise.reject(new Error('Python not found'));

  return new Promise((resolve, reject) => {
    const outputFile = path.join(outputDir, `whisperx_${Date.now()}.json`);

    // Python script that runs WhisperX and outputs JSON
    const langPy = language === 'auto' ? 'None' : JSON.stringify(language);
    const transcribeExtra = language !== 'auto' ? `, language=${JSON.stringify(language)}` : '';

    const script = `
import sys, json, warnings
warnings.filterwarnings("ignore")

try:
    import whisperx
    import torch
except ImportError as e:
    print(json.dumps({"error": f"Missing dependency: {e}. Run: pip install whisperx"}))
    sys.exit(1)

audio_path = ${JSON.stringify(audioPath)}
model_name = ${JSON.stringify(model)}
lang = ${langPy}
output_file = ${JSON.stringify(outputFile)}
device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = "float16" if device == "cuda" else "int8"

print(json.dumps({"status": "loading_model", "device": device}), flush=True)
model = whisperx.load_model(model_name, device, compute_type=compute_type)

print(json.dumps({"status": "transcribing"}), flush=True)
audio = whisperx.load_audio(audio_path)
result = model.transcribe(audio, batch_size=16${transcribeExtra})

detected_lang = result.get("language", ${JSON.stringify(language)})

print(json.dumps({"status": "aligning"}), flush=True)
align_model, align_metadata = whisperx.load_align_model(language_code=detected_lang, device=device)
result = whisperx.align(result["segments"], align_model, align_metadata, audio, device, return_char_alignments=False)

# Extract word-level and segment-level data
words = []
for seg in result.get("segments", []):
    for w in seg.get("words", []):
        if "start" in w and "end" in w:
            words.append({"word": w["word"], "start": round(w["start"], 3), "end": round(w["end"], 3)})

segments = []
for seg in result.get("segments", []):
    if "start" in seg and "end" in seg:
        segments.append({"text": seg["text"].strip(), "start": round(seg["start"], 3), "end": round(seg["end"], 3)})

output = {"words": words, "segments": segments, "language": detected_lang}
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False)

print(json.dumps({"status": "done", "words": len(words), "segments": len(segments)}), flush=True)
`;

    const scriptPath = path.join(outputDir, `whisperx_run_${Date.now()}.py`);
    fs.writeFileSync(scriptPath, script, 'utf8');

    const proc = spawn(py, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stderr = '';

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.status && onProgress) onProgress(msg.status, msg);
          if (msg.error) {
            reject(new Error(msg.error));
            proc.kill();
          }
        } catch {}
      }
    });

    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      // Clean up script
      try { fs.unlinkSync(scriptPath); } catch {}

      if (code !== 0) {
        reject(new Error(`WhisperX failed (code ${code}): ${stderr.slice(-500)}`));
        return;
      }

      try {
        const output = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
        // Clean up output file
        try { fs.unlinkSync(outputFile); } catch {}
        resolve(output);
      } catch (e) {
        reject(new Error(`Failed to read WhisperX output: ${e.message}`));
      }
    });

    proc.on('error', (err) => reject(err));
  });
}

module.exports = { findPython, isInstalled, getInstallCommand, transcribe };
