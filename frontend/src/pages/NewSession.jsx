import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Users } from 'lucide-react';
import { createSession, getSettings, createRoom, uploadAudio } from '../lib/api';
import { contextMetaLabel } from '../lib/utils';
import ContextSelector from '../components/ContextSelector';
import FileUploader from '../components/FileUploader';
import SeriesSelector from '../components/SeriesSelector';

export default function NewSession() {
  const navigate = useNavigate();
  const [context, setContext] = useState('startup_meeting');
  const [title, setTitle] = useState('');
  const [contextMeta, setContextMeta] = useState('');
  const [model, setModel] = useState('');
  const [showUploader, setShowUploader] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [seriesId, setSeriesId] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getSettings()
      .then((settings) => {
        setModel(settings.default_model || '');
      })
      .catch(() => {
        setModel('anthropic/claude-sonnet-4-20250514');
      });
  }, []);

  function buildContextMetadata() {
    const metaLabel = contextMetaLabel(context).toLowerCase();
    if (!contextMeta.trim()) return {};
    return { [metaLabel]: contextMeta.trim() };
  }

  async function handleUploadFile() {
    setError(null);
    if (!sessionId) {
      setCreating(true);
      try {
        const session = await createSession({
          context,
          title: title.trim() || undefined,
          context_metadata: buildContextMetadata(),
          model,
          series_id: seriesId || undefined,
        });
        setSessionId(session.id);
        setShowUploader(true);
      } catch (err) {
        setError(err.message || 'Failed to create session.');
      } finally {
        setCreating(false);
      }
    } else {
      setShowUploader(true);
    }
  }

  async function handleCreateRoom() {
    setCreating(true);
    setError(null);
    try {
      const room = await createRoom({
        context,
        title: title.trim() || undefined,
        context_metadata: buildContextMetadata(),
        host_name: 'Host',
      });
      navigate(`/room/${room.code}`);
    } catch (err) {
      setError(err.message || 'Failed to create room.');
      setCreating(false);
    }
  }

  function handleUploadComplete(result) {
    // After upload, navigate to session view
    navigate(`/session/${sessionId}`);
  }

  function handleUploadError(err) {
    setError(err.message || 'Upload failed.');
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-12 safe-area-inset">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="text-slate-400 hover:text-orange-400 transition-colors inline-flex items-center gap-2 text-sm font-medium touch-target"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
          Back
        </button>
        <h1 className="text-lg md:text-xl font-semibold text-slate-100">
          UPLOAD / ROOM
        </h1>
      </div>

      <p className="mt-6 text-sm text-slate-400">Upload a pre-recorded audio file or start a collaborative room.</p>

      {/* Glass form container */}
      <div className="mt-8 glass rounded-xl p-4 md:p-8">
        {/* Session Type */}
        <div>
          <span className="section-label">
            Session Type
          </span>
          <div className="mt-4">
            <ContextSelector selected={context} onSelect={setContext} />
          </div>
        </div>

        {/* Title */}
        <div className="mt-8">
          <label className="section-label">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Session title..."
            className="mt-2 glass-input w-full text-base px-4 py-3 rounded-xl"
          />
        </div>

        {/* Context metadata */}
        <div className="mt-8">
          <label className="section-label">
            {contextMetaLabel(context)}
          </label>
          <input
            type="text"
            value={contextMeta}
            onChange={(e) => setContextMeta(e.target.value)}
            placeholder={`${contextMetaLabel(context)} name...`}
            className="mt-2 glass-input w-full text-base px-4 py-3 rounded-xl"
          />
          <p className="text-xs text-slate-400 mt-1">Optional — helps the AI tailor notes to your specific context.</p>
        </div>

        {/* Series selector */}
        <div className="mt-8">
          <label className="section-label">
            Series
          </label>
          <p className="text-xs text-slate-400 mt-1">Group sessions into a series to build meeting memory across conversations.</p>
          <div className="mt-2">
            <SeriesSelector value={seriesId} onChange={setSeriesId} />
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="mt-8 text-sm text-red-400">{error}</p>
        )}

        {/* File uploader (shown when Upload File is clicked) */}
        {showUploader && sessionId && (
          <div className="mt-8">
            <FileUploader
              sessionId={sessionId}
              onComplete={handleUploadComplete}
              onError={handleUploadError}
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-8 md:mt-12 space-y-4">
          <div>
            <button
              onClick={handleUploadFile}
              disabled={creating}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 w-full justify-center touch-target"
            >
              <Upload size={16} strokeWidth={1.5} />
              Upload File
            </button>
            <p className="text-xs text-slate-400 mt-1 text-center">Upload a pre-recorded audio file (.mp3, .wav, .m4a)</p>
          </div>
          <div>
            <button
              onClick={handleCreateRoom}
              disabled={creating}
              className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50 w-full justify-center touch-target"
            >
              <Users size={16} strokeWidth={1.5} />
              Create Room
            </button>
            <p className="text-xs text-slate-400 mt-1 text-center">Start a shared session others can join with a code</p>
          </div>
        </div>
      </div>
    </div>
  );
}
