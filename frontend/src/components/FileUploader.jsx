import { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { uploadAudio } from '../lib/api';

/**
 * File upload component with drag-and-drop support.
 * Shows a thin progress bar during upload.
 * Accepted formats: .mp3, .wav, .m4a, .webm, .ogg
 */

const ACCEPTED = '.mp3,.wav,.m4a,.webm,.ogg';
const ACCEPTED_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
  'audio/ogg',
];

export default function FileUploader({ sessionId, onComplete, onError }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');

  function isValidFile(file) {
    if (!file) return false;
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    return ACCEPTED.split(',').includes(ext) || ACCEPTED_TYPES.includes(file.type);
  }

  async function handleFile(file) {
    if (!file) return;

    if (!isValidFile(file)) {
      if (onError) {
        onError(new Error(`Unsupported file type. Accepted: ${ACCEPTED}`));
      }
      return;
    }

    setFileName(file.name);
    setUploading(true);
    setProgress(0);

    // Simulate progress since fetch does not natively support upload progress.
    // We increment progress on a timer, then jump to 100 on completion.
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 300);

    try {
      const result = await uploadAudio(sessionId, file);
      clearInterval(progressInterval);
      setProgress(100);

      // Brief delay to show completion state
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
        setFileName('');
        if (onComplete) onComplete(result);
      }, 500);
    } catch (err) {
      clearInterval(progressInterval);
      setUploading(false);
      setProgress(0);
      setFileName('');
      if (onError) onError(err);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }

  function handleChange(e) {
    const file = e.target.files[0];
    handleFile(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`glass rounded-xl p-8 text-center transition-all duration-200 ${
          uploading ? 'cursor-default' : 'cursor-pointer'
        } ${
          dragOver
            ? 'border-indigo-400/50 bg-indigo-500/10'
            : 'border-white/10 border-dashed hover:bg-white/[0.08]'
        }`}
      >
        <Upload size={20} strokeWidth={1.5} className="mx-auto text-slate-500" />

        {uploading ? (
          <p className="mt-2 text-sm text-slate-300">
            Uploading {fileName}...
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-400">
              Drop audio file here or click to browse
            </p>
            <p className="mt-1 text-xs text-slate-600">
              .mp3, .wav, .m4a, .webm, .ogg
            </p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          onChange={handleChange}
          className="hidden"
        />
      </div>

      {/* Format hint */}
      {!uploading && (
        <p className="mt-2 text-xs text-slate-500">Supported: MP3, WAV, M4A, WebM, OGG. After upload, the file is transcribed automatically.</p>
      )}

      {/* Progress bar */}
      {uploading && (
        <div className="mt-2 h-1 w-full bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-1 bg-indigo-400 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
