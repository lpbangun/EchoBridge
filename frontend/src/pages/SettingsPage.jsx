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
      <div className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-400 hover:text-indigo-400 transition-colors inline-flex items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
          Back
        </button>
        <p className="mt-8 text-sm text-red-400">{fetchError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-400 hover:text-indigo-400 transition-colors inline-flex items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
          Back
        </button>
        <h1 className="text-xl font-semibold text-slate-100">
          SETTINGS
        </h1>
      </div>

      {/* DISPLAY section */}
      <div className="glass rounded-xl p-6 mt-8">
        <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          Display
        </span>
        <p className="text-sm text-slate-400 mt-1">How you appear in rooms and exports.</p>

        <label className="block mt-6">
          <span className="section-label">
            Display Name
          </span>
          <input
            type="text"
            value={userDisplayName}
            onChange={(e) => setUserDisplayName(e.target.value)}
            placeholder="Your name"
            className="glass-input w-full text-base px-4 py-3 rounded-xl mt-2"
          />
        </label>
      </div>

      {/* AI MODEL section */}
      <div className="glass rounded-xl p-6 mt-8">
        <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          AI Model
        </span>
        <p className="text-sm text-slate-400 mt-1">EchoBridge uses OpenRouter to access AI models. You'll need an API key to generate notes.</p>

        <label className="block mt-6">
          <span className="section-label">
            Default Model
          </span>
          <div className="relative mt-2">
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="glass-select w-full text-base px-4 py-3 rounded-xl appearance-none"
            >
              <option value="">Select a model</option>
              {Object.entries(models).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
              <svg className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </label>

        <label className="block mt-6">
          <span className="section-label">
            OpenRouter API Key
          </span>
          <input
            type="password"
            value={openrouterApiKey}
            onChange={(e) => setOpenrouterApiKey(e.target.value)}
            placeholder={apiKeyIsSet ? '••••••••' : 'sk-or-...'}
            className="glass-input w-full text-base px-4 py-3 rounded-xl mt-2"
          />
          {apiKeyIsSet && !openrouterApiKey && (
            <span className="mt-2 inline-flex items-center gap-1.5 text-sm text-green-400">
              <Check size={16} strokeWidth={1.5} />
              API key is set
            </span>
          )}
          <p className="text-xs text-slate-500 mt-1">
            Get your key at{' '}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition-colors">
              openrouter.ai/keys
            </a>
          </p>
        </label>
      </div>

      {/* TRANSCRIPTION section */}
      <div className="glass rounded-xl p-6 mt-8">
        <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          Transcription
        </span>
        <p className="text-sm text-slate-400 mt-1">Controls how audio is converted to text. Larger Whisper models are more accurate but slower.</p>

        <label className="block mt-6">
          <span className="section-label">
            Whisper Model
          </span>
          <div className="relative mt-2">
            <select
              value={whisperModel}
              onChange={(e) => setWhisperModel(e.target.value)}
              className="glass-select w-full text-base px-4 py-3 rounded-xl appearance-none"
            >
              {WHISPER_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
              <svg className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">'small' is recommended. Use 'large' for difficult audio or accented speech.</p>
        </label>
      </div>

      {/* EXPORT section */}
      <div className="glass rounded-xl p-6 mt-8">
        <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          Export
        </span>
        <p className="text-sm text-slate-400 mt-1">Interpretations can be exported as Markdown (.md) files — great for Obsidian, Notion, or any notes app.</p>

        <label className="block mt-6">
          <span className="section-label">
            Output Directory
          </span>
          <input
            type="text"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            placeholder="~/obsidian-vault/echobridge"
            className="glass-input w-full text-base px-4 py-3 rounded-xl mt-2"
          />
        </label>

        <label className="mt-6 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoExport}
            onChange={(e) => setAutoExport(e.target.checked)}
            className="h-4 w-4 accent-indigo-500"
          />
          <span className="text-sm text-slate-300">
            Auto-export after interpretation
          </span>
        </label>

        <label className="mt-4 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={includeTranscript}
            onChange={(e) => setIncludeTranscript(e.target.checked)}
            className="h-4 w-4 accent-indigo-500"
          />
          <span className="text-sm text-slate-300">
            Include transcript in .md export
          </span>
        </label>
      </div>

      {/* Save button + feedback */}
      <div className="mt-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {saveSuccess && (
          <p className="mt-4 text-sm text-green-400">{saveSuccess}</p>
        )}
        {saveError && (
          <p className="mt-4 text-sm text-red-400">{saveError}</p>
        )}
      </div>

      {/* AGENT API KEYS section */}
      <div className="glass rounded-xl p-6 mt-8">
        <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          Agent API Keys
        </span>
        <p className="text-sm text-slate-400 mt-1">Let external AI agents connect to EchoBridge programmatically. Generate a key here, then add it to your agent's config.</p>

        <label className="block mt-6">
          <span className="section-label">
            Key Name
          </span>
          <input
            type="text"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="my-agent"
            className="glass-input w-full text-base px-4 py-3 rounded-xl mt-2"
          />
        </label>

        <div className="mt-4">
          <button
            onClick={handleGenerateKey}
            disabled={generatingKey || !keyName.trim()}
            className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Key size={16} strokeWidth={1.5} />
            {generatingKey ? 'Generating...' : 'Generate Key'}
          </button>
        </div>

        {keyError && (
          <p className="mt-4 text-sm text-red-400">{keyError}</p>
        )}

        {generatedKey && (
          <div className="glass-strong rounded-xl p-6 mt-6">
            <p className="text-sm text-amber-400 font-medium">
              Copy now — this key will not be shown again
            </p>
            <p className="mt-3 font-mono text-sm text-slate-300 break-all">
              {generatedKey.key}
            </p>
            <button
              onClick={handleCopyKey}
              className="mt-4 btn-secondary inline-flex items-center gap-2"
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
