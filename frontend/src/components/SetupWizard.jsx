import { useState, useEffect } from 'react';
import { Mic, Cpu, FolderOpen, ChevronRight, Check, ExternalLink, Link, FileText, Copy } from 'lucide-react';
import { getSettings, updateSettings, createInvite, getSkillMd } from '../lib/api';

const STT_OPTIONS = [
  { id: 'local', name: 'Local (Whisper)', description: 'Runs on your machine. No API key needed. Moderate accuracy.', recommended: false },
  { id: 'deepgram', name: 'Deepgram', description: 'Best accuracy. Free tier: 200 hours/month. Requires API key.', recommended: true },
  { id: 'openai', name: 'OpenAI Whisper', description: 'Good accuracy. Uses your OpenAI API key.', recommended: false },
];

const AI_PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', description: 'One key for 500+ models. Best flexibility.', recommended: true, keyPrefix: 'sk-or-', docsUrl: 'https://openrouter.ai/keys' },
  { id: 'anthropic', name: 'Anthropic', description: 'Direct access to Claude models.', recommended: false, keyPrefix: 'sk-ant-', docsUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', description: 'Direct access to GPT models.', recommended: false, keyPrefix: 'sk-', docsUrl: 'https://platform.openai.com/api-keys' },
];

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [sttProvider, setSttProvider] = useState('local');
  const [deepgramKey, setDeepgramKey] = useState('');
  const [openaiKeyForStt, setOpenaiKeyForStt] = useState('');
  const [aiProvider, setAiProvider] = useState('openrouter');
  const [aiKey, setAiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState('x-ai/grok-4.1-fast');
  const [outputDir, setOutputDir] = useState('~/Downloads/EchoBridge');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Track if an AI key is already configured (e.g. via env var)
  const [existingKeySet, setExistingKeySet] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      const hasKey = s.openrouter_api_key_set || s.openai_api_key_set || s.anthropic_api_key_set || s.google_api_key_set || s.xai_api_key_set;
      setExistingKeySet(hasKey);
      if (s.ai_provider) setAiProvider(s.ai_provider);
      if (s.default_model) setDefaultModel(s.default_model);
      if (s.stt_provider) setSttProvider(s.stt_provider);
      if (s.output_dir) setOutputDir(s.output_dir);
    }).catch(() => {});
  }, []);

  // Agent setup state
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteUrl, setInviteUrl] = useState(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedSkill, setCopiedSkill] = useState(false);
  const [agentError, setAgentError] = useState(null);

  const steps = [
    { icon: Mic, label: 'Transcription' },
    { icon: Cpu, label: 'AI Provider' },
    { icon: FolderOpen, label: 'Output' },
    { icon: Link, label: 'Agent Connection' },
  ];

  async function handleCreateInvite() {
    setCreatingInvite(true);
    setAgentError(null);
    try {
      const invite = await createInvite('Setup wizard');
      setInviteUrl(invite.invite_url);
    } catch (err) {
      setAgentError(err.message || 'Failed to create invite.');
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleCopyInviteUrl() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      setAgentError('Failed to copy. Please select and copy manually.');
    }
  }

  async function handleCopySkill() {
    setAgentError(null);
    let skillText;
    try {
      skillText = await getSkillMd();
    } catch (err) {
      setAgentError(`Could not load skill file: ${err.message}`);
      return;
    }
    try {
      await navigator.clipboard.writeText(skillText);
      setCopiedSkill(true);
      setTimeout(() => setCopiedSkill(false), 2000);
    } catch {
      const blob = new Blob([skillText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setAgentError('Clipboard blocked. Opened skill file in a new tab.');
    }
  }

  async function handleComplete() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        stt_provider: sttProvider,
        ai_provider: aiProvider,
        default_model: defaultModel,
        output_dir: outputDir,
        auto_export: true,
        onboarding_complete: true,
      };

      // Set the appropriate API key
      const keyMap = {
        openrouter: 'openrouter_api_key',
        openai: 'openai_api_key',
        anthropic: 'anthropic_api_key',
      };
      if (aiKey && keyMap[aiProvider]) {
        payload[keyMap[aiProvider]] = aiKey;
      }

      // Deepgram key
      if (sttProvider === 'deepgram' && deepgramKey) {
        payload.deepgram_api_key = deepgramKey;
      }
      // OpenAI key for STT (may also be the AI key if provider is openai)
      if (sttProvider === 'openai' && openaiKeyForStt) {
        payload.openai_api_key = openaiKeyForStt;
      }

      await updateSettings(payload);
      onComplete();
    } catch (err) {
      setError(err.message || 'Failed to save settings.');
      setSaving(false);
    }
  }

  function canProceed() {
    if (step === 0) return true; // STT step — local doesn't need a key
    if (step === 1) return existingKeySet || aiKey.trim().length > 0; // Key already set via env or entered
    return true;
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 safe-area-inset">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <h1
          className="text-2xl font-bold tracking-tight text-white text-center mb-2"
        >
          ECHOBRIDGE
        </h1>
        <p className="text-sm text-zinc-400 text-center mb-8">
          Let's get you set up in 4 quick steps.
        </p>

        {/* Progress steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                i < step ? 'bg-green-500/20 border border-green-500/40' :
                i === step ? 'bg-accent-muted border border-accent-border' :
                'bg-zinc-800 border border-border'
              }`}>
                {i < step ? (
                  <Check size={16} strokeWidth={2} className="text-green-400" />
                ) : (
                  <s.icon size={16} strokeWidth={1.5} className={i === step ? 'text-accent' : 'text-zinc-500'} />
                )}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-8 h-px ${i < step ? 'bg-green-500/40' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="card p-6">
          {/* Step 0: Transcription */}
          {step === 0 && (
            <div>
              <h2 className="text-base font-semibold text-zinc-200">How should audio be transcribed?</h2>
              <p className="text-sm text-zinc-400 mt-1">Choose how uploaded audio files are converted to text.</p>

              <div className="mt-6 space-y-3">
                {STT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSttProvider(opt.id)}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      sttProvider === opt.id
                        ? 'border-accent-border bg-accent-muted'
                        : 'border-border bg-zinc-800/50 hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-200">{opt.name}</span>
                      {opt.recommended && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent-muted px-2 py-0.5 rounded-full">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{opt.description}</p>
                  </button>
                ))}
              </div>

              {sttProvider === 'deepgram' && (
                <label className="block mt-4">
                  <span className="section-label">Deepgram API Key</span>
                  <input
                    type="password"
                    value={deepgramKey}
                    onChange={(e) => setDeepgramKey(e.target.value)}
                    placeholder="Enter your Deepgram key"
                    className="eb-input w-full text-sm px-4 py-2.5 rounded-lg mt-2"
                  />
                  <p className="text-xs text-zinc-400 mt-1">
                    Get a free key at{' '}
                    <a href="https://console.deepgram.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover inline-flex items-center gap-1">
                      console.deepgram.com <ExternalLink size={10} />
                    </a>
                  </p>
                </label>
              )}

              {sttProvider === 'openai' && (
                <label className="block mt-4">
                  <span className="section-label">OpenAI API Key</span>
                  <input
                    type="password"
                    value={openaiKeyForStt}
                    onChange={(e) => setOpenaiKeyForStt(e.target.value)}
                    placeholder="sk-..."
                    className="eb-input w-full text-sm px-4 py-2.5 rounded-lg mt-2"
                  />
                </label>
              )}
            </div>
          )}

          {/* Step 1: AI Provider */}
          {step === 1 && (
            <div>
              <h2 className="text-base font-semibold text-zinc-200">Which AI provider should generate notes?</h2>
              <p className="text-sm text-zinc-400 mt-1">Your transcript is sent to this provider for interpretation.</p>

              <div className="mt-6 space-y-3">
                {AI_PROVIDERS.map((prov) => (
                  <button
                    key={prov.id}
                    onClick={() => {
                      setAiProvider(prov.id);
                      if (prov.id === 'openrouter') setDefaultModel('x-ai/grok-4.1-fast');
                      else if (prov.id === 'anthropic') setDefaultModel('claude-sonnet-4-6-latest');
                      else if (prov.id === 'openai') setDefaultModel('gpt-4o');
                    }}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      aiProvider === prov.id
                        ? 'border-accent-border bg-accent-muted'
                        : 'border-border bg-zinc-800/50 hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-200">{prov.name}</span>
                      {prov.recommended && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent-muted px-2 py-0.5 rounded-full">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{prov.description}</p>
                  </button>
                ))}
              </div>

              <label className="block mt-6">
                <span className="section-label">
                  {AI_PROVIDERS.find(p => p.id === aiProvider)?.name} API Key
                </span>
                {existingKeySet ? (
                  <div className="mt-2 flex items-center gap-2 text-sm text-green-400">
                    <Check size={14} />
                    <span>API key is already configured. You can proceed or enter a new one to override.</span>
                  </div>
                ) : null}
                <input
                  type="password"
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  placeholder={existingKeySet ? '••••••••' : `${AI_PROVIDERS.find(p => p.id === aiProvider)?.keyPrefix || ''}...`}
                  className="eb-input w-full text-sm px-4 py-2.5 rounded-lg mt-2"
                />
                {!existingKeySet && (
                  <p className="text-xs text-zinc-400 mt-1">
                    Get your key at{' '}
                    <a
                      href={AI_PROVIDERS.find(p => p.id === aiProvider)?.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:text-accent-hover inline-flex items-center gap-1"
                    >
                      {AI_PROVIDERS.find(p => p.id === aiProvider)?.docsUrl.replace('https://', '').split('/')[0]}
                      <ExternalLink size={10} />
                    </a>
                  </p>
                )}
              </label>
            </div>
          )}

          {/* Step 2: Output */}
          {step === 2 && (
            <div>
              <h2 className="text-base font-semibold text-zinc-200">Where should meeting notes be saved?</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Choose a directory for exported meeting notes.
              </p>

              <label className="block mt-6">
                <span className="section-label">Output Directory</span>
                <input
                  type="text"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder="~/Downloads/EchoBridge"
                  className="eb-input w-full text-sm px-4 py-2.5 rounded-lg mt-2"
                />
                <p className="text-xs text-zinc-400 mt-1">
                  Point this to any folder — Obsidian, Notion sync, or a directory your agent watches.
                </p>
              </label>
            </div>
          )}

          {/* Step 3: Agent Connection */}
          {step === 3 && (
            <div>
              <h2 className="text-base font-semibold text-zinc-200">Connect an agent</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Optional — skip this if you don't use AI agents yet.
              </p>

              <div className="mt-6 space-y-3">
                {/* Copy Skill File */}
                <button
                  onClick={handleCopySkill}
                  className="w-full text-left p-4 rounded-lg border border-border bg-zinc-800/50 hover:bg-zinc-800 transition-all"
                >
                  <div className="flex items-center gap-3">
                    {copiedSkill ? (
                      <Check size={18} strokeWidth={1.5} className="text-green-400 flex-shrink-0" />
                    ) : (
                      <FileText size={18} strokeWidth={1.5} className="text-zinc-400 flex-shrink-0" />
                    )}
                    <div>
                      <span className="text-sm font-medium text-zinc-200">
                        {copiedSkill ? 'Skill File Copied!' : 'Copy Skill File'}
                      </span>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Copy SKILL.md to your clipboard — paste into your agent's skills directory.
                      </p>
                    </div>
                  </div>
                </button>

                {/* Invite link */}
                {!inviteUrl ? (
                  <button
                    onClick={handleCreateInvite}
                    disabled={creatingInvite}
                    className="w-full text-left p-4 rounded-lg border border-border bg-zinc-800/50 hover:bg-zinc-800 transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <Link size={18} strokeWidth={1.5} className="text-accent flex-shrink-0" />
                      <div>
                        <span className="text-sm font-medium text-zinc-200">
                          {creatingInvite ? 'Creating...' : 'Create Invite Link'}
                        </span>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Generate a single-use URL for an agent operator to auto-configure their key + SKILL.md.
                        </p>
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="p-4 rounded-lg border border-accent-border bg-accent-muted">
                    <p className="text-xs text-amber-400 font-medium">Single-use — expires in 7 days</p>
                    <p className="mt-2 font-mono text-xs text-zinc-300 break-all select-all">{inviteUrl}</p>
                    <button
                      onClick={handleCopyInviteUrl}
                      className="mt-3 btn-secondary inline-flex items-center gap-2 text-sm"
                    >
                      {copiedInvite ? (
                        <><Check size={14} strokeWidth={1.5} /> Copied!</>
                      ) : (
                        <><Copy size={14} strokeWidth={1.5} /> Copy URL</>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {agentError && (
                <p className="mt-3 text-xs text-red-400">{agentError}</p>
              )}

              <p className="mt-6 text-xs text-zinc-500">
                You can always set this up later in Settings.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="mt-4 text-sm text-red-400">{error}</p>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <div>
              <div className="flex items-center gap-4">
                {step > 0 && (
                  <button
                    onClick={() => setStep(step - 1)}
                    className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={onComplete}
                  className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Skip setup
                </button>
              </div>
            </div>
            <div>
              {step < 3 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={!canProceed()}
                  className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                >
                  Next
                  <ChevronRight size={16} strokeWidth={1.5} />
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  disabled={saving}
                  className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Finish Setup'}
                  {!saving && <Check size={16} strokeWidth={1.5} />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
