import { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { uploadAudio } from '../lib/api';

/**
 * File upload component with drag-and-drop support.
 * Shows a thin progress bar (no rounded corners) during upload.
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
        className={`border border-dashed p-8 text-center transition-colors ${
          uploading ? 'cursor-default' : 'cursor-pointer'
        } ${
          dragOver
            ? 'border-neutral-900'
            : 'border-neutral-300 hover:border-neutral-400'
        }`}
      >
        <Upload size={20} strokeWidth={1.5} className="mx-auto text-neutral-500" />

        {uploading ? (
          <p className="mt-2 text-sm text-neutral-600">
            Uploading {fileName}...
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-neutral-600">
              Drop audio file here or click to browse
            </p>
            <p className="mt-1 text-xs text-neutral-400">
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

      {/* Progress bar: thin, no rounded corners, per DESIGN.md */}
      {uploading && (
        <div className="mt-2 h-1 w-full bg-neutral-100">
          <div
            className="h-1 bg-neutral-900 transition-all duration-300"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
