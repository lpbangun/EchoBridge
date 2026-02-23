import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, Upload, Users } from 'lucide-react';
import { createSession, getSettings, createRoom, uploadAudio } from '../lib/api';
import { contextMetaLabel } from '../lib/utils';
import ContextSelector from '../components/ContextSelector';
import FileUploader from '../components/FileUploader';

export default function NewSession() {
  const navigate = useNavigate();
  const [context, setContext] = useState('startup_meeting');
  const [title, setTitle] = useState('');
  const [contextMeta, setContextMeta] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState([]);
  const [showUploader, setShowUploader] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getSettings()
      .then((settings) => {
        const modelList = settings.models || [];
        setModels(modelList);
        setModel(settings.default_model || modelList[0] || '');
      })
      .catch(() => {
        // Default models if settings endpoint fails
        setModels([
          'anthropic/claude-sonnet-4-20250514',
          'google/gemini-2.5-flash-preview',
          'deepseek/deepseek-chat-v3-0324',
        ]);
        setModel('anthropic/claude-sonnet-4-20250514');
      });
  }, []);

  function buildContextMetadata() {
    const metaLabel = contextMetaLabel(context).toLowerCase();
    if (!contextMeta.trim()) return {};
    return { [metaLabel]: contextMeta.trim() };
  }

  async function handleRecordLive() {
    setCreating(true);
    setError(null);
    try {
      const session = await createSession({
        context,
        title: title.trim() || undefined,
        context_metadata: buildContextMetadata(),
        model,
      });
      navigate(`/recording/${session.id}`);
    } catch (err) {
      setError(err.message || 'Failed to create session.');
      setCreating(false);
    }
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
    <div className="max-w-3xl mx-auto px-6 py-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="text-neutral-500 hover:text-neutral-700 transition-colors inline-flex items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
          Back
        </button>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">
          NEW SESSION
        </h1>
      </div>

      {/* Session Type */}
      <div className="mt-12">
        <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
          Session Type
        </span>
        <div className="mt-4">
          <ContextSelector selected={context} onSelect={setContext} />
        </div>
      </div>

      {/* Title */}
      <div className="mt-8">
        <label className="text-xs font-medium tracking-widest uppercase text-neutral-500">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Session title..."
          className="mt-2 w-full text-base px-4 py-3 border border-neutral-200 bg-white placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none transition-colors"
        />
      </div>

      {/* Context metadata */}
      <div className="mt-8">
        <label className="text-xs font-medium tracking-widest uppercase text-neutral-500">
          {contextMetaLabel(context)}
        </label>
        <input
          type="text"
          value={contextMeta}
          onChange={(e) => setContextMeta(e.target.value)}
          placeholder={`${contextMetaLabel(context)} name...`}
          className="mt-2 w-full text-base px-4 py-3 border border-neutral-200 bg-white placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none transition-colors"
        />
      </div>

      {/* Model selector */}
      <div className="mt-8">
        <label className="text-xs font-medium tracking-widest uppercase text-neutral-500">
          Model
        </label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="mt-2 w-full text-base px-4 py-3 border border-neutral-200 bg-white focus:border-neutral-900 focus:outline-none transition-colors appearance-none"
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <p className="mt-8 text-sm text-red-600">{error}</p>
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
      <div className="mt-12 flex gap-4">
        <button
          onClick={handleRecordLive}
          disabled={creating}
          className="bg-neutral-900 text-white text-sm font-medium px-5 py-2.5 hover:bg-neutral-800 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Mic size={16} strokeWidth={1.5} />
          Record Live
        </button>
        <button
          onClick={handleUploadFile}
          disabled={creating}
          className="bg-white text-neutral-700 text-sm font-medium px-5 py-2.5 border border-neutral-200 hover:border-neutral-400 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Upload size={16} strokeWidth={1.5} />
          Upload File
        </button>
        <button
          onClick={handleCreateRoom}
          disabled={creating}
          className="bg-white text-neutral-700 text-sm font-medium px-5 py-2.5 border border-neutral-200 hover:border-neutral-400 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Users size={16} strokeWidth={1.5} />
          Create Room
        </button>
      </div>
    </div>
  );
}
