import { useState } from 'react';
import { Mic, Cpu, FolderOpen, ChevronRight, Check, ExternalLink } from 'lucide-react';
import { updateSettings } from '../lib/api';

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

  const steps = [
    { icon: Mic, label: 'Transcription' },
    { icon: Cpu, label: 'AI Provider' },
    { icon: FolderOpen, label: 'Agent Bridge' },
  ];

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
    if (step === 1) return aiKey.trim().length > 0; // Must enter AI key
    return true;
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 safe-area-inset">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <h1
          className="text-2xl font-bold tracking-tight text-slate-50 text-center mb-2"
          style={{ textShadow: '0 0 20px rgba(249, 115, 22, 0.3)' }}
        >
          ECHOBRIDGE
        </h1>
        <p className="text-sm text-slate-400 text-center mb-8">
          Let's get you set up in 3 quick steps.
        </p>

        {/* Progress steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                i < step ? 'bg-green-500/20 border border-green-500/40' :
                i === step ? 'bg-orange-500/20 border border-orange-500/40' :
                'bg-white/10 border border-white/15'
              }`}>
                {i < step ? (
                  <Check size={16} strokeWidth={2} className="text-green-400" />
                ) : (
                  <s.icon size={16} strokeWidth={1.5} className={i === step ? 'text-orange-400' : 'text-slate-500'} />
                )}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-8 h-px ${i < step ? 'bg-green-500/40' : 'bg-white/15'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="glass rounded-xl p-6">
          {/* Step 0: Transcription */}
          {step === 0 && (
            <div>
              <h2 className="text-base font-semibold text-slate-200">How should audio be transcribed?</h2>
              <p className="text-sm text-slate-400 mt-1">Choose how uploaded audio files are converted to text.</p>

              <div className="mt-6 space-y-3">
                {STT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSttProvider(opt.id)}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      sttProvider === opt.id
                        ? 'border-orange-500/40 bg-orange-500/10'
                        : 'border-white/15 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-200">{opt.name}</span>
                      {opt.recommended && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{opt.description}</p>
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
                    className="glass-input w-full text-sm px-4 py-2.5 rounded-lg mt-2"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Get a free key at{' '}
                    <a href="https://console.deepgram.com" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 inline-flex items-center gap-1">
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
                    className="glass-input w-full text-sm px-4 py-2.5 rounded-lg mt-2"
                  />
                </label>
              )}
            </div>
          )}

          {/* Step 1: AI Provider */}
          {step === 1 && (
            <div>
              <h2 className="text-base font-semibold text-slate-200">Which AI provider should generate notes?</h2>
              <p className="text-sm text-slate-400 mt-1">Your transcript is sent to this provider for interpretation.</p>

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
                        ? 'border-orange-500/40 bg-orange-500/10'
                        : 'border-white/15 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-200">{prov.name}</span>
                      {prov.recommended && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{prov.description}</p>
                  </button>
                ))}
              </div>

              <label className="block mt-6">
                <span className="section-label">
                  {AI_PROVIDERS.find(p => p.id === aiProvider)?.name} API Key
                </span>
                <input
                  type="password"
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  placeholder={`${AI_PROVIDERS.find(p => p.id === aiProvider)?.keyPrefix || ''}...`}
                  className="glass-input w-full text-sm px-4 py-2.5 rounded-lg mt-2"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Get your key at{' '}
                  <a
                    href={AI_PROVIDERS.find(p => p.id === aiProvider)?.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-400 hover:text-orange-300 inline-flex items-center gap-1"
                  >
                    {AI_PROVIDERS.find(p => p.id === aiProvider)?.docsUrl.replace('https://', '').split('/')[0]}
                    <ExternalLink size={10} />
                  </a>
                </p>
              </label>
            </div>
          )}

          {/* Step 2: Agent Bridge */}
          {step === 2 && (
            <div>
              <h2 className="text-base font-semibold text-slate-200">Where should meeting notes be saved?</h2>
              <p className="text-sm text-slate-400 mt-1">
                Point this to any folder. Works great with Obsidian, Notion sync folders, or a directory your AI agent watches.
              </p>

              <label className="block mt-6">
                <span className="section-label">Output Directory</span>
                <input
                  type="text"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder="~/Downloads/EchoBridge"
                  className="glass-input w-full text-sm px-4 py-2.5 rounded-lg mt-2"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Tip: If using OpenClaw locally, point this to a folder in your agent's <code className="text-slate-400">extraPaths</code>.
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  Remote agent? It connects via API instead — generate a key in{' '}
                  <span className="text-slate-300">Settings → Agent Connections</span> after setup.
                </p>
              </label>
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
                    className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={onComplete}
                  className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Skip setup
                </button>
              </div>
            </div>
            <div>
              {step < 2 ? (
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
