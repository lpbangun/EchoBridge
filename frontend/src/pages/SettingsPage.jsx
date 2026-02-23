import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Key, Check } from 'lucide-react';
import { getSettings, updateSettings, createApiKey } from '../lib/api';

const WHISPER_MODELS = ['tiny', 'base', 'small', 'medium', 'large'];

export default function SettingsPage() {
  const navigate = useNavigate();

  // Loading / error for initial fetch
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Settings form state
  const [original, setOriginal] = useState(null);
  const [userDisplayName, setUserDisplayName] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [autoExport, setAutoExport] = useState(false);
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const [whisperModel, setWhisperModel] = useState('small');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [apiKeyIsSet, setApiKeyIsSet] = useState(false);
  const [models, setModels] = useState({});

  // Save feedback
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [saveError, setSaveError] = useState(null);

  // API key generation
  const [keyName, setKeyName] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState(null);
  const [keyError, setKeyError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      setFetchError(null);
      try {
        const data = await getSettings();
        setOriginal(data);
        setUserDisplayName(data.user_display_name || '');
        setDefaultModel(data.default_model || '');
        setOutputDir(data.output_dir || '');
        setAutoExport(data.auto_export || false);
        setIncludeTranscript(data.include_transcript_in_md || false);
        setWhisperModel(data.whisper_model || 'small');
        setApiKeyIsSet(data.openrouter_api_key_set || false);
        setModels(data.models || {});
      } catch (err) {
        setFetchError(err.message || 'Failed to load settings.');
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    // Build payload with only changed fields
    const payload = {};
    if (userDisplayName !== (original.user_display_name || '')) {
      payload.user_display_name = userDisplayName;
    }
    if (defaultModel !== (original.default_model || '')) {
      payload.default_model = defaultModel;
    }
    if (outputDir !== (original.output_dir || '')) {
      payload.output_dir = outputDir;
    }
    if (autoExport !== (original.auto_export || false)) {
      payload.auto_export = autoExport;
    }
    if (includeTranscript !== (original.include_transcript_in_md || false)) {
      payload.include_transcript_in_md = includeTranscript;
    }
    if (whisperModel !== (original.whisper_model || 'small')) {
      payload.whisper_model = whisperModel;
    }
    if (openrouterApiKey) {
      payload.openrouter_api_key = openrouterApiKey;
    }

    if (Object.keys(payload).length === 0) {
      setSaveSuccess('No changes to save.');
      setSaving(false);
      return;
    }

    try {
      const updated = await updateSettings(payload);
      // Refresh original to reflect saved state
      setOriginal(updated);
      setApiKeyIsSet(updated.openrouter_api_key_set || false);
      setOpenrouterApiKey('');
      setSaveSuccess('Settings saved.');
    } catch (err) {
      setSaveError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateKey() {
    if (!keyName.trim()) return;
    setGeneratingKey(true);
    setKeyError(null);
    setGeneratedKey(null);
    setCopied(false);

    try {
      const result = await createApiKey(keyName.trim());
      setGeneratedKey(result);
      setKeyName('');
    } catch (err) {
      setKeyError(err.message || 'Failed to generate API key.');
    } finally {
      setGeneratingKey(false);
    }
  }

  async function handleCopyKey() {
    if (!generatedKey) return;
    try {
      await navigator.clipboard.writeText(generatedKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
      setKeyError('Failed to copy. Please select and copy manually.');
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-sm text-neutral-500">Loading...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <button
          onClick={() => navigate(-1)}
          className="text-neutral-500 hover:text-neutral-700 transition-colors inline-flex items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
          Back
        </button>
        <p className="mt-8 text-sm text-red-600">{fetchError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="text-neutral-500 hover:text-neutral-700 transition-colors inline-flex items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
          Back
        </button>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">
          SETTINGS
        </h1>
      </div>

      {/* DISPLAY section */}
      <div className="mt-12 pt-8 border-t border-neutral-200">
        <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
          Display
        </span>

        <label className="block mt-6">
          <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
            Display Name
          </span>
          <input
            type="text"
            value={userDisplayName}
            onChange={(e) => setUserDisplayName(e.target.value)}
            placeholder="Your name"
            className="mt-2 w-full text-base px-4 py-3 border border-neutral-200 bg-white placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none transition-colors"
          />
        </label>
      </div>

      {/* AI MODEL section */}
      <div className="mt-12 pt-8 border-t border-neutral-200">
        <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
          AI Model
        </span>

        <label className="block mt-6">
          <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
            Default Model
          </span>
          <div className="relative mt-2">
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="w-full text-base px-4 py-3 border border-neutral-200 bg-white focus:border-neutral-900 focus:outline-none transition-colors appearance-none"
            >
              <option value="">Select a model</option>
              {Object.entries(models).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
              <svg className="h-4 w-4 text-neutral-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </label>

        <label className="block mt-6">
          <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
            OpenRouter API Key
          </span>
          <input
            type="password"
            value={openrouterApiKey}
            onChange={(e) => setOpenrouterApiKey(e.target.value)}
            placeholder={apiKeyIsSet ? '••••••••' : 'sk-or-...'}
            className="mt-2 w-full text-base px-4 py-3 border border-neutral-200 bg-white placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none transition-colors"
          />
          {apiKeyIsSet && !openrouterApiKey && (
            <span className="mt-2 inline-flex items-center gap-1.5 text-sm text-green-600">
              <Check size={16} strokeWidth={1.5} />
              API key is set
            </span>
          )}
        </label>
      </div>

      {/* TRANSCRIPTION section */}
      <div className="mt-12 pt-8 border-t border-neutral-200">
        <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
          Transcription
        </span>

        <label className="block mt-6">
          <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
            Whisper Model
          </span>
          <div className="relative mt-2">
            <select
              value={whisperModel}
              onChange={(e) => setWhisperModel(e.target.value)}
              className="w-full text-base px-4 py-3 border border-neutral-200 bg-white focus:border-neutral-900 focus:outline-none transition-colors appearance-none"
            >
              {WHISPER_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
              <svg className="h-4 w-4 text-neutral-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </label>
      </div>

      {/* EXPORT section */}
      <div className="mt-12 pt-8 border-t border-neutral-200">
        <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
          Export
        </span>

        <label className="block mt-6">
          <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
            Output Directory
          </span>
          <input
            type="text"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            placeholder="~/obsidian-vault/echobridge"
            className="mt-2 w-full text-base px-4 py-3 border border-neutral-200 bg-white placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none transition-colors"
          />
        </label>

        <label className="mt-6 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoExport}
            onChange={(e) => setAutoExport(e.target.checked)}
            className="h-4 w-4 accent-neutral-900"
          />
          <span className="text-sm text-neutral-700">
            Auto-export after interpretation
          </span>
        </label>

        <label className="mt-4 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={includeTranscript}
            onChange={(e) => setIncludeTranscript(e.target.checked)}
            className="h-4 w-4 accent-neutral-900"
          />
          <span className="text-sm text-neutral-700">
            Include transcript in .md export
          </span>
        </label>
      </div>

      {/* Save button + feedback */}
      <div className="mt-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-neutral-900 text-white text-sm font-medium px-5 py-2.5 hover:bg-neutral-800 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {saveSuccess && (
          <p className="mt-4 text-sm text-green-600">{saveSuccess}</p>
        )}
        {saveError && (
          <p className="mt-4 text-sm text-red-600">{saveError}</p>
        )}
      </div>

      {/* AGENT API KEYS section */}
      <div className="mt-12 pt-8 border-t border-neutral-200">
        <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
          Agent API Keys
        </span>

        <label className="block mt-6">
          <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
            Key Name
          </span>
          <input
            type="text"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="my-agent"
            className="mt-2 w-full text-base px-4 py-3 border border-neutral-200 bg-white placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none transition-colors"
          />
        </label>

        <div className="mt-4">
          <button
            onClick={handleGenerateKey}
            disabled={generatingKey || !keyName.trim()}
            className="bg-white text-neutral-700 text-sm font-medium px-5 py-2.5 border border-neutral-200 hover:border-neutral-400 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            <Key size={16} strokeWidth={1.5} />
            {generatingKey ? 'Generating...' : 'Generate Key'}
          </button>
        </div>

        {keyError && (
          <p className="mt-4 text-sm text-red-600">{keyError}</p>
        )}

        {generatedKey && (
          <div className="mt-6 border border-neutral-200 p-6">
            <p className="text-sm text-amber-600 font-medium">
              Copy now — this key will not be shown again
            </p>
            <p className="mt-3 font-mono text-sm text-neutral-700 break-all">
              {generatedKey.key}
            </p>
            <button
              onClick={handleCopyKey}
              className="mt-4 bg-white text-neutral-700 text-sm font-medium px-5 py-2.5 border border-neutral-200 hover:border-neutral-400 transition-colors inline-flex items-center gap-2"
            >
              {copied ? (
                <>
                  <Check size={16} strokeWidth={1.5} />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={16} strokeWidth={1.5} />
                  Copy
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
