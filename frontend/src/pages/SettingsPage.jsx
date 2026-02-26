import { useState, useEffect } from 'react';
import { Copy, Key, Check, ExternalLink, Cloud, RefreshCw, FileText, Link, Trash2 } from 'lucide-react';
import { getSettings, updateSettings, createApiKey, listApiKeys, deleteApiKey, testCloudConnection, getStorageStatus, getSkillMd, listSockets, createInvite, listInvites, revokeInvite } from '../lib/api';

const WHISPER_MODELS = ['tiny', 'base', 'small', 'medium', 'large'];

const OPENAI_STT_MODELS = [
  { id: 'whisper-1', name: 'Whisper v2', description: 'Fast, cost-effective' },
  { id: 'gpt-4o-mini-transcribe', name: 'GPT-4o Mini Transcribe', description: 'Balanced speed and accuracy' },
  { id: 'gpt-4o-transcribe', name: 'GPT-4o Transcribe', description: 'Highest accuracy' },
];

const DEEPGRAM_MODELS = [
  { id: 'nova-3', name: 'Nova 3', description: 'Latest, best accuracy' },
  { id: 'nova-2', name: 'Nova 2', description: 'Previous generation' },
];

const PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', keyPrefix: 'sk-or-', docsUrl: 'https://openrouter.ai/keys', description: 'Access 500+ models from all providers through one API key.' },
  { id: 'openai', name: 'OpenAI', keyPrefix: 'sk-', docsUrl: 'https://platform.openai.com/api-keys', description: 'GPT-4o, o3, and other OpenAI models directly.' },
  { id: 'anthropic', name: 'Anthropic', keyPrefix: 'sk-ant-', docsUrl: 'https://console.anthropic.com/settings/keys', description: 'Claude Opus, Sonnet, and Haiku directly.' },
  { id: 'google', name: 'Google Gemini', keyPrefix: 'AI', docsUrl: 'https://aistudio.google.com/apikey', description: 'Gemini Flash and Pro models directly.' },
  { id: 'xai', name: 'xAI', keyPrefix: 'xai-', docsUrl: 'https://console.x.ai', description: 'Grok models directly.' },
];

const PROVIDER_MODEL_DOCS = {
  openrouter: 'https://openrouter.ai/models',
  openai: 'https://platform.openai.com/docs/models',
  anthropic: 'https://docs.anthropic.com/en/docs/about-claude/models',
  google: 'https://ai.google.dev/gemini-api/docs/models',
  xai: 'https://docs.x.ai/docs/models',
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Settings form state
  const [original, setOriginal] = useState(null);
  const [userDisplayName, setUserDisplayName] = useState('');
  const [aiProvider, setAiProvider] = useState('openrouter');
  const [defaultModel, setDefaultModel] = useState('');
  const [customModelId, setCustomModelId] = useState('');
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [outputDir, setOutputDir] = useState('');
  const [autoExport, setAutoExport] = useState(false);
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const [sttProvider, setSttProvider] = useState('local');
  const [whisperModel, setWhisperModel] = useState('small');
  const [openaiSttModel, setOpenaiSttModel] = useState('whisper-1');
  const [providerModels, setProviderModels] = useState({});
  const [deepgramModel, setDeepgramModel] = useState('nova-3');
  const [deepgramKey, setDeepgramKey] = useState('');
  const [deepgramKeySet, setDeepgramKeySet] = useState(false);

  // API keys per provider
  const [apiKeys, setApiKeys] = useState({
    openrouter: '',
    openai: '',
    anthropic: '',
    google: '',
    xai: '',
  });
  const [apiKeySetFlags, setApiKeySetFlags] = useState({
    openrouter: false,
    openai: false,
    anthropic: false,
    google: false,
    xai: false,
  });

  // Save feedback
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [saveError, setSaveError] = useState(null);

  // Agent API key generation
  const [keyName, setKeyName] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState(null);
  const [keyError, setKeyError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [configTab, setConfigTab] = useState('mcp');
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [copiedSkill, setCopiedSkill] = useState(false);

  // Cloud storage state
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [s3Endpoint, setS3Endpoint] = useState('');
  const [s3AccessKey, setS3AccessKey] = useState('');
  const [s3SecretKey, setS3SecretKey] = useState('');
  const [s3SecretConfigured, setS3SecretConfigured] = useState(false);
  const [s3Bucket, setS3Bucket] = useState('');
  const [s3Region, setS3Region] = useState('auto');
  const [s3Prefix, setS3Prefix] = useState('echobridge/');
  const [cloudSyncAudio, setCloudSyncAudio] = useState(true);
  const [cloudSyncExports, setCloudSyncExports] = useState(true);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);

  // Auto-sockets state
  const [autoSockets, setAutoSockets] = useState([]);
  const [availableSockets, setAvailableSockets] = useState([]);

  // Invite state
  const [inviteLabel, setInviteLabel] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [latestInvite, setLatestInvite] = useState(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [inviteError, setInviteError] = useState(null);

  // Connected agents state
  const [connectedAgents, setConnectedAgents] = useState([]);
  const [revokingKeyId, setRevokingKeyId] = useState(null);

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      setFetchError(null);
      try {
        const data = await getSettings();
        setOriginal(data);
        setUserDisplayName(data.user_display_name || '');
        setAiProvider(data.ai_provider || 'openrouter');
        setDefaultModel(data.default_model || '');
        setOutputDir(data.output_dir || '');
        setAutoExport(data.auto_export || false);
        setIncludeTranscript(data.include_transcript_in_md || false);
        setSttProvider(data.stt_provider || 'local');
        setWhisperModel(data.whisper_model || 'small');
        setOpenaiSttModel(data.openai_stt_model || 'whisper-1');
        setProviderModels(data.provider_models || {});
        setDeepgramModel(data.deepgram_model || 'nova-3');
        setDeepgramKeySet(data.deepgram_api_key_set || false);
        setApiKeySetFlags({
          openrouter: data.openrouter_api_key_set || false,
          openai: data.openai_api_key_set || false,
          anthropic: data.anthropic_api_key_set || false,
          google: data.google_api_key_set || false,
          xai: data.xai_api_key_set || false,
        });
        // Cloud storage
        setCloudEnabled(data.cloud_storage_enabled || false);
        setS3Endpoint(data.s3_endpoint_url || '');
        setS3AccessKey(data.s3_access_key_id || '');
        setS3SecretConfigured(data.s3_secret_configured || false);
        setS3Bucket(data.s3_bucket_name || '');
        setS3Region(data.s3_region || 'auto');
        setS3Prefix(data.s3_prefix || 'echobridge/');
        setCloudSyncAudio(data.cloud_sync_audio !== false);
        setCloudSyncExports(data.cloud_sync_exports !== false);
        setAutoSockets(data.auto_sockets || []);
      } catch (err) {
        setFetchError(err.message || 'Failed to load settings.');
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();

    // Fetch available sockets for auto-sockets config
    async function fetchSockets() {
      try {
        const sockets = await listSockets();
        setAvailableSockets(Array.isArray(sockets) ? sockets : []);
      } catch {
        // Silently fail socket fetch
      }
    }
    fetchSockets();

    // Fetch pending invites
    async function fetchInvites() {
      try {
        const invites = await listInvites();
        setPendingInvites((invites || []).filter(i => !i.claimed_at));
      } catch {
        // Silently fail invite fetch
      }
    }
    fetchInvites();

    // Fetch connected agents (API keys)
    async function fetchAgentKeys() {
      try {
        const keys = await listApiKeys();
        setConnectedAgents(Array.isArray(keys) ? keys : []);
      } catch {
        // Silently fail
      }
    }
    fetchAgentKeys();
  }, []);

  // When provider changes, reset model selection to first available for that provider
  function handleProviderChange(newProvider) {
    setAiProvider(newProvider);
    setUseCustomModel(false);
    setCustomModelId('');
    const models = providerModels[newProvider] || {};
    const modelIds = Object.keys(models);
    setDefaultModel(modelIds[0] || '');
  }

  async function handleSave() {
    setSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    const effectiveModel = useCustomModel && customModelId.trim()
      ? customModelId.trim()
      : defaultModel;

    const payload = {};
    if (aiProvider !== (original.ai_provider || 'openrouter')) {
      payload.ai_provider = aiProvider;
    }
    if (effectiveModel !== (original.default_model || '')) {
      payload.default_model = effectiveModel;
    }
    if (userDisplayName !== (original.user_display_name || '')) {
      payload.user_display_name = userDisplayName;
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
    if (sttProvider !== (original.stt_provider || 'local')) {
      payload.stt_provider = sttProvider;
    }
    if (whisperModel !== (original.whisper_model || 'small')) {
      payload.whisper_model = whisperModel;
    }
    if (openaiSttModel !== (original.openai_stt_model || 'whisper-1')) {
      payload.openai_stt_model = openaiSttModel;
    }
    if (deepgramKey) payload.deepgram_api_key = deepgramKey;
    if (deepgramModel !== (original.deepgram_model || 'nova-3')) {
      payload.deepgram_model = deepgramModel;
    }

    // Cloud storage settings (always send if different from original)
    if (cloudEnabled !== (original.cloud_storage_enabled || false)) {
      payload.cloud_storage_enabled = cloudEnabled;
    }
    if (s3Endpoint !== (original.s3_endpoint_url || '')) {
      payload.s3_endpoint_url = s3Endpoint;
    }
    if (s3AccessKey !== (original.s3_access_key_id || '')) {
      payload.s3_access_key_id = s3AccessKey;
    }
    if (s3SecretKey) {
      payload.s3_secret_access_key = s3SecretKey;
    }
    if (s3Bucket !== (original.s3_bucket_name || '')) {
      payload.s3_bucket_name = s3Bucket;
    }
    if (s3Region !== (original.s3_region || 'auto')) {
      payload.s3_region = s3Region;
    }
    if (s3Prefix !== (original.s3_prefix || 'echobridge/')) {
      payload.s3_prefix = s3Prefix;
    }
    if (cloudSyncAudio !== (original.cloud_sync_audio !== false)) {
      payload.cloud_sync_audio = cloudSyncAudio;
    }
    if (cloudSyncExports !== (original.cloud_sync_exports !== false)) {
      payload.cloud_sync_exports = cloudSyncExports;
    }

    // Auto-sockets
    const origAutoSockets = original.auto_sockets || [];
    if (JSON.stringify([...autoSockets].sort()) !== JSON.stringify([...origAutoSockets].sort())) {
      payload.auto_sockets = autoSockets;
    }

    // Send API keys that have been entered
    if (apiKeys.openrouter) payload.openrouter_api_key = apiKeys.openrouter;
    if (apiKeys.openai) payload.openai_api_key = apiKeys.openai;
    if (apiKeys.anthropic) payload.anthropic_api_key = apiKeys.anthropic;
    if (apiKeys.google) payload.google_api_key = apiKeys.google;
    if (apiKeys.xai) payload.xai_api_key = apiKeys.xai;

    if (Object.keys(payload).length === 0) {
      setSaveSuccess('No changes to save.');
      setSaving(false);
      return;
    }

    try {
      const updated = await updateSettings(payload);
      setOriginal(updated);
      setApiKeySetFlags({
        openrouter: updated.openrouter_api_key_set || false,
        openai: updated.openai_api_key_set || false,
        anthropic: updated.anthropic_api_key_set || false,
        google: updated.google_api_key_set || false,
        xai: updated.xai_api_key_set || false,
      });
      setApiKeys({ openrouter: '', openai: '', anthropic: '', google: '', xai: '' });
      setDeepgramKey('');
      setDeepgramKeySet(updated.deepgram_api_key_set || false);
      setS3SecretKey('');
      setS3SecretConfigured(updated.s3_secret_configured || false);
      setAutoSockets(updated.auto_sockets || []);
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
      // Refresh connected agents list
      try {
        const keys = await listApiKeys();
        setConnectedAgents(Array.isArray(keys) ? keys : []);
      } catch {
        // Silently fail
      }
    } catch (err) {
      setKeyError(err.message || 'Failed to generate API key.');
    } finally {
      setGeneratingKey(false);
    }
  }

  async function handleRevokeAgentKey(keyId) {
    setRevokingKeyId(keyId);
    try {
      await deleteApiKey(keyId);
      setConnectedAgents(prev => prev.filter(k => k.id !== keyId));
    } catch (err) {
      setKeyError(err.message || 'Failed to revoke key.');
    } finally {
      setRevokingKeyId(null);
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const result = await testCloudConnection();
      setConnectionResult(result);
    } catch (err) {
      setConnectionResult({ ok: false, message: err.message || 'Test failed' });
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleRefreshSyncStatus() {
    try {
      const status = await getStorageStatus();
      setSyncStatus(status);
    } catch {
      // Silently fail
    }
  }

  async function handleCopyKey() {
    if (!generatedKey) return;
    try {
      await navigator.clipboard.writeText(generatedKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setKeyError('Failed to copy. Please select and copy manually.');
    }
  }

  function getBaseUrl() {
    return window.location.origin;
  }

  function getConfigSnippet(tab) {
    const baseUrl = getBaseUrl();
    const key = generatedKey?.key || '';
    if (tab === 'mcp') {
      return JSON.stringify({
        mcpServers: {
          echobridge: {
            url: `${baseUrl}/mcp`,
            headers: {
              Authorization: `Bearer ${key}`,
            },
          },
        },
      }, null, 2);
    }
    if (tab === 'openclaw') {
      return `# 1. Set environment variables
export ECHOBRIDGE_API_URL=${baseUrl}
export ECHOBRIDGE_API_KEY=${key}

# 2. Install skill (run on your agent's machine)
mkdir -p skills/echobridge
curl -H "Authorization: Bearer ${key}" \\
  ${baseUrl}/api/v1/skill > skills/echobridge/SKILL.md

# 3. Test connection
curl -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \\
  $ECHOBRIDGE_API_URL/api/v1/ping`;
    }
    // rest
    return `curl -H "Authorization: Bearer ${key}" \\\n  ${baseUrl}/api/v1/sessions`;
  }

  async function handleCopyConfig() {
    try {
      await navigator.clipboard.writeText(getConfigSnippet(configTab));
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    } catch {
      setKeyError('Failed to copy. Please select and copy manually.');
    }
  }

  async function handleCopySkill() {
    let skillText;
    try {
      skillText = await getSkillMd();
    } catch {
      setKeyError('Could not load skill file from server. Make sure the backend is running.');
      return;
    }
    try {
      await navigator.clipboard.writeText(skillText);
      setCopiedSkill(true);
      setTimeout(() => setCopiedSkill(false), 2000);
    } catch {
      // Clipboard blocked — open in new tab so user can copy manually
      const blob = new Blob([skillText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setKeyError('Clipboard access denied. Opened skill file in a new tab — copy from there.');
    }
  }

  async function handleCreateInvite() {
    setCreatingInvite(true);
    setInviteError(null);
    setLatestInvite(null);
    setCopiedInvite(false);
    try {
      const invite = await createInvite(inviteLabel.trim());
      setLatestInvite(invite);
      setInviteLabel('');
      // Refresh pending list
      const invites = await listInvites();
      setPendingInvites((invites || []).filter(i => !i.claimed_at));
    } catch (err) {
      setInviteError(err.message || 'Failed to create invite.');
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleRevokeInvite(id) {
    try {
      await revokeInvite(id);
      setPendingInvites(prev => prev.filter(i => i.id !== id));
      if (latestInvite?.id === id) setLatestInvite(null);
    } catch (err) {
      setInviteError(err.message || 'Failed to revoke invite.');
    }
  }

  async function handleCopyInviteUrl() {
    if (!latestInvite?.invite_url) return;
    try {
      await navigator.clipboard.writeText(latestInvite.invite_url);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      setInviteError('Failed to copy. Please select and copy manually.');
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <p className="text-sm text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <p className="mt-8 text-sm text-red-400">{fetchError}</p>
      </div>
    );
  }

  const currentProvider = PROVIDERS.find((p) => p.id === aiProvider) || PROVIDERS[0];
  const currentModels = providerModels[aiProvider] || {};

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <h1 className="font-display text-xl font-bold text-white">
        SETTINGS
      </h1>

      {/* DISPLAY section */}
      <div className="card-lg p-4 md:p-6 mt-8">
        <span className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
          Display
        </span>
        <p className="text-sm text-zinc-400 mt-1">How you appear in rooms and exports.</p>

        <label className="block mt-6">
          <span className="section-label">
            Display Name
          </span>
          <input
            type="text"
            value={userDisplayName}
            onChange={(e) => setUserDisplayName(e.target.value)}
            placeholder="Your name"
            className="eb-input w-full text-base px-4 py-3 rounded-xl mt-2"
          />
        </label>
      </div>

      {/* AI PROVIDER section */}
      <div className="card-lg p-4 md:p-6 mt-8">
        <span className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
          AI Provider
        </span>
        <p className="text-sm text-zinc-400 mt-1">Choose where to send AI requests. Each provider requires its own API key.</p>

        {/* Provider tabs */}
        <div className="flex flex-wrap gap-2 mt-6 overflow-x-auto">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              onClick={() => handleProviderChange(provider.id)}
              className={`px-3 md:px-4 py-2 text-sm font-medium rounded-lg transition-colors touch-target whitespace-nowrap ${
                aiProvider === provider.id
                  ? 'bg-accent-muted text-accent border border-accent-border'
                  : 'text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-300'
              }`}
            >
              {provider.name}
              {apiKeySetFlags[provider.id] && (
                <Check size={14} strokeWidth={2} className="inline ml-1.5 text-green-400" />
              )}
            </button>
          ))}
        </div>

        {/* Provider description */}
        <p className="text-sm text-zinc-400 mt-4">{currentProvider.description}</p>

        {/* API key for selected provider */}
        <label className="block mt-6">
          <span className="section-label">
            {currentProvider.name} API Key
          </span>
          <input
            type="password"
            value={apiKeys[aiProvider]}
            onChange={(e) => setApiKeys({ ...apiKeys, [aiProvider]: e.target.value })}
            placeholder={apiKeySetFlags[aiProvider] ? '••••••••' : `${currentProvider.keyPrefix}...`}
            className="eb-input w-full text-base px-4 py-3 rounded-xl mt-2"
          />
          {apiKeySetFlags[aiProvider] && !apiKeys[aiProvider] && (
            <span className="mt-2 inline-flex items-center gap-1.5 text-sm text-green-400">
              <Check size={16} strokeWidth={1.5} />
              API key is set
            </span>
          )}
          <p className="text-xs text-zinc-400 mt-1">
            Get your key at{' '}
            <a href={currentProvider.docsUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1">
              {currentProvider.docsUrl.replace('https://', '').split('/')[0]}
              <ExternalLink size={12} />
            </a>
          </p>
        </label>
      </div>

      {/* MODEL section */}
      <div className="card-lg p-4 md:p-6 mt-8">
        <span className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
          Default Model
        </span>
        <p className="text-sm text-zinc-400 mt-1">
          Pick a preset or paste any model ID from{' '}
          <a href={PROVIDER_MODEL_DOCS[aiProvider]} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1">
            {currentProvider.name} docs
            <ExternalLink size={12} />
          </a>
        </p>

        {/* Preset model dropdown */}
        {!useCustomModel && (
          <label className="block mt-6">
            <span className="section-label">
              Recommended Models
            </span>
            <div className="relative mt-2">
              <select
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="eb-select w-full text-base px-4 py-3 rounded-xl appearance-none"
              >
                <option value="">Select a model</option>
                {Object.entries(currentModels).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name} — {id}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
                <svg className="h-4 w-4 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </label>
        )}

        {/* Custom model input */}
        {useCustomModel && (
          <label className="block mt-6">
            <span className="section-label">
              Custom Model ID
            </span>
            <input
              type="text"
              value={customModelId}
              onChange={(e) => setCustomModelId(e.target.value)}
              placeholder={aiProvider === 'openrouter' ? 'e.g. anthropic/claude-opus-4.6' : 'e.g. gpt-4o'}
              className="eb-input w-full text-base px-4 py-3 rounded-xl mt-2 font-mono text-sm"
            />
            <p className="text-xs text-zinc-400 mt-1">
              Paste the exact model ID from your provider's documentation.
            </p>
          </label>
        )}

        {/* Toggle between preset and custom */}
        <button
          type="button"
          onClick={() => setUseCustomModel(!useCustomModel)}
          className="mt-4 text-sm text-accent hover:text-accent-hover transition-colors"
        >
          {useCustomModel ? 'Use a recommended model instead' : 'Paste a custom model ID instead'}
        </button>
      </div>

      {/* TRANSCRIPTION section */}
      <div className="card-lg p-4 md:p-6 mt-8">
        <span className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
          Transcription
        </span>
        <p className="text-sm text-zinc-400 mt-1">Controls how uploaded audio is converted to text. Live recording always uses browser speech recognition.</p>

        {/* Provider toggle */}
        <div className="mt-6">
          <span className="section-label">Provider</span>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setSttProvider('local')}
              className={`px-3 md:px-4 py-2 text-sm font-medium rounded-lg transition-colors touch-target whitespace-nowrap ${
                sttProvider === 'local'
                  ? 'bg-accent-muted text-accent border border-accent-border'
                  : 'text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-300'
              }`}
            >
              Local (Whisper)
            </button>
            <button
              onClick={() => setSttProvider('openai')}
              className={`px-3 md:px-4 py-2 text-sm font-medium rounded-lg transition-colors touch-target whitespace-nowrap ${
                sttProvider === 'openai'
                  ? 'bg-accent-muted text-accent border border-accent-border'
                  : 'text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-300'
              }`}
            >
              Cloud (OpenAI)
            </button>
            <button
              onClick={() => setSttProvider('deepgram')}
              className={`px-3 md:px-4 py-2 text-sm font-medium rounded-lg transition-colors touch-target whitespace-nowrap ${
                sttProvider === 'deepgram'
                  ? 'bg-accent-muted text-accent border border-accent-border'
                  : 'text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-300'
              }`}
            >
              Deepgram
            </button>
          </div>
        </div>

        {sttProvider === 'local' && (
          <label className="block mt-6">
            <span className="section-label">
              Whisper Model
            </span>
            <div className="relative mt-2">
              <select
                value={whisperModel}
                onChange={(e) => setWhisperModel(e.target.value)}
                className="eb-select w-full text-base px-4 py-3 rounded-xl appearance-none"
              >
                {WHISPER_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
                <svg className="h-4 w-4 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <p className="text-xs text-zinc-400 mt-1">'small' is recommended. Use 'large' for difficult audio or accented speech.</p>
          </label>
        )}

        {sttProvider === 'openai' && (
          <>
            <label className="block mt-6">
              <span className="section-label">
                OpenAI STT Model
              </span>
              <div className="relative mt-2">
                <select
                  value={openaiSttModel}
                  onChange={(e) => setOpenaiSttModel(e.target.value)}
                  className="eb-select w-full text-base px-4 py-3 rounded-xl appearance-none"
                >
                  {OPENAI_STT_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.description}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
                  <svg className="h-4 w-4 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </label>
            {!apiKeySetFlags.openai && !apiKeys.openai && (
              <p className="mt-3 text-sm text-amber-400">
                Requires an OpenAI API key — set one in the AI Provider section above.
              </p>
            )}
          </>
        )}

        {sttProvider === 'deepgram' && (
          <>
            <label className="block mt-6">
              <span className="section-label">Deepgram Model</span>
              <div className="relative mt-2">
                <select
                  value={deepgramModel}
                  onChange={(e) => setDeepgramModel(e.target.value)}
                  className="eb-select w-full text-base px-4 py-3 rounded-xl appearance-none"
                >
                  {DEEPGRAM_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.description}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
                  <svg className="h-4 w-4 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </label>
            <label className="block mt-4">
              <span className="section-label">Deepgram API Key</span>
              <input
                type="password"
                value={deepgramKey}
                onChange={(e) => setDeepgramKey(e.target.value)}
                placeholder={deepgramKeySet ? '••••••••' : 'Enter Deepgram API key'}
                className="eb-input w-full text-base px-4 py-3 rounded-xl mt-2"
              />
              {deepgramKeySet && !deepgramKey && (
                <span className="mt-2 inline-flex items-center gap-1.5 text-sm text-green-400">
                  <Check size={16} strokeWidth={1.5} />
                  API key is set
                </span>
              )}
              <p className="text-xs text-zinc-400 mt-1">
                Get your key at{' '}
                <a href="https://console.deepgram.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1">
                  console.deepgram.com
                  <ExternalLink size={12} />
                </a>
                {' '}— free tier includes 200 hours/month.
              </p>
            </label>
          </>
        )}
      </div>

      {/* AUTO SOCKETS section */}
      <div className="card-lg p-4 md:p-6 mt-8">
        <span className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
          Auto Sockets
        </span>
        <p className="text-sm text-zinc-400 mt-1">
          Automatically run these analysis sockets after every recording completes (in addition to smart notes).
        </p>

        {availableSockets.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No sockets available.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {availableSockets.map((socket) => (
              <label key={socket.id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSockets.includes(socket.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setAutoSockets((prev) => [...prev, socket.id]);
                    } else {
                      setAutoSockets((prev) => prev.filter((s) => s !== socket.id));
                    }
                  }}
                  className="h-4 w-4 accent-lime-400"
                />
                <div>
                  <span className="text-sm text-zinc-300">{socket.name}</span>
                  <p className="text-xs text-zinc-500">{socket.description}</p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* EXPORT section */}
      <div className="card-lg p-4 md:p-6 mt-8">
        <span className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
          Export
        </span>
        <p className="text-sm text-zinc-400 mt-1">Interpretations can be exported as Markdown (.md) files — great for Obsidian, Notion, or any notes app.</p>

        <label className="block mt-6">
          <span className="section-label">
            Output Directory
          </span>
          <input
            type="text"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            placeholder="~/Downloads/EchoBridge"
            className="eb-input w-full text-base px-4 py-3 rounded-xl mt-2"
          />
        </label>

        <label className="mt-6 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoExport}
            onChange={(e) => setAutoExport(e.target.checked)}
            className="h-4 w-4 accent-lime-400"
          />
          <span className="text-sm text-zinc-300">
            Auto-export after interpretation
          </span>
        </label>

        <label className="mt-4 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={includeTranscript}
            onChange={(e) => setIncludeTranscript(e.target.checked)}
            className="h-4 w-4 accent-lime-400"
          />
          <span className="text-sm text-zinc-300">
            Include transcript in .md export
          </span>
        </label>
      </div>

      {/* CLOUD STORAGE section */}
      <div className="card-lg p-4 md:p-6 mt-8">
        <div className="flex items-center gap-2">
          <Cloud size={18} strokeWidth={1.5} className="text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
            Cloud Storage
          </span>
        </div>
        <p className="text-sm text-zinc-400 mt-1">Back up audio and exports to S3-compatible storage (AWS S3, Cloudflare R2, Backblaze B2, MinIO).</p>

        <label className="mt-6 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={cloudEnabled}
            onChange={(e) => setCloudEnabled(e.target.checked)}
            className="h-4 w-4 accent-lime-400"
          />
          <span className="text-sm text-zinc-300">
            Enable cloud storage
          </span>
        </label>

        {cloudEnabled && (
          <>
            <label className="block mt-6">
              <span className="section-label">
                Endpoint URL
              </span>
              <input
                type="text"
                value={s3Endpoint}
                onChange={(e) => setS3Endpoint(e.target.value)}
                placeholder="Leave empty for AWS S3, or enter R2/B2/MinIO URL"
                className="eb-input w-full text-base px-4 py-3 rounded-xl mt-2"
              />
              <p className="text-xs text-zinc-400 mt-1">
                Only needed for non-AWS providers (e.g. https://&lt;account&gt;.r2.cloudflarestorage.com)
              </p>
            </label>

            <label className="block mt-4">
              <span className="section-label">
                Access Key ID
              </span>
              <input
                type="text"
                value={s3AccessKey}
                onChange={(e) => setS3AccessKey(e.target.value)}
                placeholder="AKIAIOSFODNN7EXAMPLE"
                className="eb-input w-full text-base px-4 py-3 rounded-xl mt-2 font-mono text-sm"
              />
            </label>

            <label className="block mt-4">
              <span className="section-label">
                Secret Access Key
              </span>
              <input
                type="password"
                value={s3SecretKey}
                onChange={(e) => setS3SecretKey(e.target.value)}
                placeholder={s3SecretConfigured ? '••••••••' : 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'}
                className="eb-input w-full text-base px-4 py-3 rounded-xl mt-2 font-mono text-sm"
              />
              {s3SecretConfigured && !s3SecretKey && (
                <span className="mt-2 inline-flex items-center gap-1.5 text-sm text-green-400">
                  <Check size={16} strokeWidth={1.5} />
                  Secret key is set
                </span>
              )}
            </label>

            <label className="block mt-4">
              <span className="section-label">
                Bucket Name
              </span>
              <input
                type="text"
                value={s3Bucket}
                onChange={(e) => setS3Bucket(e.target.value)}
                placeholder="my-echobridge-bucket"
                className="eb-input w-full text-base px-4 py-3 rounded-xl mt-2"
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <label className="block">
                <span className="section-label">
                  Region
                </span>
                <input
                  type="text"
                  value={s3Region}
                  onChange={(e) => setS3Region(e.target.value)}
                  placeholder="auto"
                  className="eb-input w-full text-base px-4 py-3 rounded-xl mt-2"
                />
              </label>

              <label className="block">
                <span className="section-label">
                  Key Prefix
                </span>
                <input
                  type="text"
                  value={s3Prefix}
                  onChange={(e) => setS3Prefix(e.target.value)}
                  placeholder="echobridge/"
                  className="eb-input w-full text-base px-4 py-3 rounded-xl mt-2"
                />
              </label>
            </div>

            <label className="mt-6 flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={cloudSyncAudio}
                onChange={(e) => setCloudSyncAudio(e.target.checked)}
                className="h-4 w-4 accent-lime-400"
              />
              <span className="text-sm text-zinc-300">
                Sync audio recordings
              </span>
            </label>

            <label className="mt-3 flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={cloudSyncExports}
                onChange={(e) => setCloudSyncExports(e.target.checked)}
                className="h-4 w-4 accent-lime-400"
              />
              <span className="text-sm text-zinc-300">
                Sync markdown exports
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-3 mt-6">
              <button
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50 touch-target"
              >
                <Cloud size={16} strokeWidth={1.5} />
                {testingConnection ? 'Testing...' : 'Test Connection'}
              </button>

              <button
                onClick={handleRefreshSyncStatus}
                className="btn-secondary inline-flex items-center gap-2 touch-target"
              >
                <RefreshCw size={16} strokeWidth={1.5} />
                Sync Status
              </button>
            </div>

            {connectionResult && (
              <p className={`mt-3 text-sm ${connectionResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                {connectionResult.message}
              </p>
            )}

            {syncStatus && (
              <div className="bg-surface-dark border border-border rounded-xl p-4 mt-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-semibold text-white">{syncStatus.pending}</p>
                    <p className="text-xs text-zinc-400 mt-1">Pending</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-green-400">{syncStatus.completed}</p>
                    <p className="text-xs text-zinc-400 mt-1">Uploaded</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-red-400">{syncStatus.failed}</p>
                    <p className="text-xs text-zinc-400 mt-1">Failed</p>
                  </div>
                </div>
                {syncStatus.last_error && (
                  <p className="mt-3 text-xs text-red-400">{syncStatus.last_error}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Save button + feedback */}
      <div className="mt-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary disabled:opacity-50 touch-target"
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

      {/* AGENT CONNECTIONS section */}
      <div className="card-lg p-4 md:p-6 mt-8">
        <span className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
          Agent Connections
        </span>
        <p className="text-sm text-zinc-400 mt-1">Let external AI agents connect to EchoBridge programmatically.</p>

        {keyError && (
          <p className="mt-4 text-sm text-red-400">{keyError}</p>
        )}

        {/* 1. Connected Agents list */}
        <div className="mt-6">
          <span className="section-label">Connected Agents</span>
          {connectedAgents.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No agents connected yet. Use an invite link or generate a key below.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {connectedAgents.map((agent) => {
                const lastUsed = agent.last_used_at ? new Date(agent.last_used_at) : null;
                const isActive = lastUsed && (Date.now() - lastUsed.getTime()) < 24 * 60 * 60 * 1000;
                return (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-3 bg-zinc-900/40 border border-zinc-700 rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`flex-shrink-0 w-2 h-2 rounded-full ${isActive ? 'bg-green-400' : 'bg-zinc-600'}`}
                        title={isActive ? 'Active in last 24h' : 'Inactive'}
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-300 font-medium truncate">{agent.name}</p>
                        <p className="text-xs text-zinc-500">
                          Created {new Date(agent.created_at).toLocaleDateString()}
                          {lastUsed && (
                            <> · Last active {lastUsed.toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeAgentKey(agent.id)}
                      disabled={revokingKeyId === agent.id}
                      className="ml-3 p-2 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
                      title="Revoke key"
                    >
                      <Trash2 size={16} strokeWidth={1.5} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Invite Link (recommended path) */}
        <div className="mt-8 pt-6 border-t border-zinc-700">
          <span className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
            Invite Link
          </span>
          <p className="text-sm text-zinc-400 mt-1">
            Recommended. Generate a single-use URL — the agent operator visits it, enters a name, and gets a pre-configured SKILL.md with their API key embedded. Zero manual config.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <input
              type="text"
              value={inviteLabel}
              onChange={(e) => setInviteLabel(e.target.value)}
              placeholder="Label (optional, e.g. 'OpenClaw prod')"
              className="eb-input flex-1 text-base px-4 py-3 rounded-xl"
            />
            <button
              onClick={handleCreateInvite}
              disabled={creatingInvite}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 touch-target whitespace-nowrap"
            >
              <Link size={16} strokeWidth={1.5} />
              {creatingInvite ? 'Creating...' : 'Create Invite'}
            </button>
          </div>

          {inviteError && (
            <p className="mt-3 text-sm text-red-400">{inviteError}</p>
          )}

          {latestInvite && (
            <div className="mt-4 p-4 bg-zinc-900/60 border border-zinc-700 rounded-lg">
              <p className="text-sm text-amber-400 font-medium">
                Single-use — expires in 7 days
              </p>
              <p className="mt-2 font-mono text-sm text-zinc-300 break-all select-all">
                {latestInvite.invite_url}
              </p>
              <button
                onClick={handleCopyInviteUrl}
                className="mt-3 btn-secondary inline-flex items-center gap-2 touch-target"
              >
                {copiedInvite ? (
                  <><Check size={16} strokeWidth={1.5} /> Copied!</>
                ) : (
                  <><Copy size={16} strokeWidth={1.5} /> Copy URL</>
                )}
              </button>
            </div>
          )}

          {pendingInvites.length > 0 && (
            <div className="mt-4">
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Pending Invites
              </span>
              <div className="mt-2 space-y-2">
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between p-3 bg-zinc-900/40 border border-zinc-700 rounded-lg"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-300 truncate">
                        {inv.label || 'Unlabeled invite'}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Expires {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : 'never'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevokeInvite(inv.id)}
                      className="ml-3 p-2 text-zinc-500 hover:text-red-400 transition-colors"
                      title="Revoke invite"
                    >
                      <Trash2 size={16} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. Manual Setup (advanced) */}
        <div className="mt-8 pt-6 border-t border-zinc-700">
          <span className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
            Manual Setup
          </span>
          <p className="text-sm text-zinc-400 mt-1">Generate a key directly and configure your agent manually.</p>

          <label className="block mt-4">
            <span className="section-label">
              Key Name
            </span>
            <input
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="my-agent"
              className="eb-input w-full text-base px-4 py-3 rounded-xl mt-2"
            />
          </label>

          <div className="mt-4">
            <button
              onClick={handleGenerateKey}
              disabled={generatingKey || !keyName.trim()}
              className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50 touch-target"
            >
              <Key size={16} strokeWidth={1.5} />
              {generatingKey ? 'Generating...' : 'Generate Key'}
            </button>
          </div>

          {generatedKey && (
            <div className="bg-surface-dark border border-border rounded-xl p-4 md:p-6 mt-6">
              <p className="text-sm text-amber-400 font-medium">
                Copy now — this key will not be shown again
              </p>
              <p className="mt-3 font-mono text-sm text-zinc-300 break-all">
                {generatedKey.key}
              </p>
              <button
                onClick={handleCopyKey}
                className="mt-4 btn-secondary inline-flex items-center gap-2 touch-target"
              >
                {copied ? (
                  <>
                    <Check size={16} strokeWidth={1.5} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={16} strokeWidth={1.5} />
                    Copy Key
                  </>
                )}
              </button>

              {/* Tabbed config snippets */}
              <div className="mt-6 border-t border-zinc-700 pt-6">
                <span className="section-label">Connection Config</span>
                <div className="flex flex-wrap gap-2 mt-3">
                  {[
                    { id: 'mcp', label: 'MCP Client' },
                    { id: 'openclaw', label: 'OpenClaw' },
                    { id: 'rest', label: 'REST API' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => { setConfigTab(tab.id); setCopiedConfig(false); }}
                      className={`px-3 md:px-4 py-2 text-sm font-medium rounded-lg transition-colors touch-target whitespace-nowrap ${
                        configTab === tab.id
                          ? 'bg-accent-muted text-accent border border-accent-border'
                          : 'text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <pre className="mt-4 p-4 bg-zinc-900/60 border border-zinc-700 rounded-lg font-mono text-sm text-zinc-300 overflow-x-auto whitespace-pre-wrap break-all">
                  {getConfigSnippet(configTab)}
                </pre>

                <p className="mt-2 text-xs text-zinc-400">
                  {configTab === 'mcp' && (
                    <>Add this to your MCP client config (e.g. <code className="text-zinc-400">~/.claude/settings.json</code> for Claude Code, or Claude Desktop settings).</>
                  )}
                  {configTab === 'openclaw' && (
                    <>Run these commands on your agent's machine. Step 2 auto-downloads the SKILL.md via the API. Step 3 verifies the connection.</>
                  )}
                  {configTab === 'rest' && (
                    <>Use this pattern with any HTTP client. Full API: /api/v1/sessions, /api/v1/search, /api/v1/sockets, and more.</>
                  )}
                </p>

                <button
                  onClick={handleCopyConfig}
                  className="mt-3 btn-secondary inline-flex items-center gap-2 touch-target"
                >
                  {copiedConfig ? (
                    <>
                      <Check size={16} strokeWidth={1.5} />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={16} strokeWidth={1.5} />
                      Copy Config
                    </>
                  )}
                </button>
              </div>

            </div>
          )}
        </div>

        {/* Skill File (always visible) */}
        <div className="mt-8 pt-6 border-t border-zinc-700">
          <span className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
            Skill File
          </span>
          <p className="text-sm text-zinc-400 mt-1">
            Share the EchoBridge skill file with your agent. Paste this into your agent's skills directory or knowledge base.
          </p>
          <button
            onClick={handleCopySkill}
            className="mt-4 btn-secondary inline-flex items-center gap-2 touch-target"
          >
            {copiedSkill ? (
              <>
                <Check size={16} strokeWidth={1.5} />
                Copied!
              </>
            ) : (
              <>
                <FileText size={16} strokeWidth={1.5} />
                Copy Skill File
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
