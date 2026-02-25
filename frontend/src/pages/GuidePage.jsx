import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Key, Cpu, Mic, Layers, Box, Users, BookOpen, Settings, Bot, FolderOpen } from 'lucide-react';

export default function GuidePage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-12 safe-area-inset">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-400 hover:text-orange-400 transition-colors inline-flex items-center gap-2 text-sm font-medium touch-target"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
          Back
        </button>
        <h1 className="text-lg md:text-xl font-semibold text-slate-100">
          GUIDE
        </h1>
      </div>

      {/* Recommended Setup */}
      <div className="glass rounded-xl p-4 md:p-6 mt-8">
        <span className="text-sm font-semibold text-orange-300 uppercase tracking-wider">
          Recommended Setup
        </span>
        <p className="text-sm text-slate-400 mt-1">The optimal configuration for quality and ease of use.</p>

        <div className="mt-6 space-y-6">
          <div className="flex gap-4">
            <Mic size={18} strokeWidth={1.5} className="text-orange-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Transcription: Deepgram Nova 3</h3>
              <p className="text-sm text-slate-400 mt-0.5">
                Best-in-class accuracy for speech-to-text. Free tier includes 200 hours/month — more than enough for most users. Use Local Whisper if you want zero cloud dependency.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <Cpu size={18} strokeWidth={1.5} className="text-orange-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-200">AI: OpenRouter + Claude Sonnet 4.6</h3>
              <p className="text-sm text-slate-400 mt-0.5">
                OpenRouter gives you one API key for 500+ models. Claude Sonnet 4.6 is the best balance of quality and speed for meeting notes. Alternative: direct Anthropic API.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <FolderOpen size={18} strokeWidth={1.5} className="text-orange-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Agent Bridge: Output to Agent Memory</h3>
              <p className="text-sm text-slate-400 mt-0.5">
                Set the output directory to a folder in your OpenClaw agent's <code className="text-slate-400">extraPaths</code>. Your agent will automatically discover new meeting notes on its next heartbeat. No API configuration needed — just files.
              </p>
            </div>
          </div>
        </div>

        {/* .env snippet */}
        <div className="mt-6">
          <span className="section-label">Recommended .env</span>
          <pre className="mt-2 p-4 bg-slate-900/60 border border-slate-700 rounded-lg font-mono text-xs text-slate-300 overflow-x-auto whitespace-pre">
{`AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-your-key
DEFAULT_MODEL=anthropic/claude-sonnet-4.6
STT_PROVIDER=deepgram
DEEPGRAM_API_KEY=your-deepgram-key
DEEPGRAM_MODEL=nova-3
OUTPUT_DIR=~/agent-memory/echobridge
AUTO_EXPORT=true
AUTO_INTERPRET=true`}
          </pre>
        </div>
      </div>

      {/* Quick Setup */}
      <div className="glass rounded-xl p-4 md:p-6 mt-8">
        <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          Quick Setup
        </span>
        <p className="text-sm text-slate-400 mt-1">Three steps to your first AI-powered notes.</p>

        <div className="mt-6 space-y-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center">
              <Key size={16} strokeWidth={1.5} className="text-orange-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">1. Set your AI provider</h3>
              <p className="text-sm text-slate-400 mt-1">
                Go to{' '}
                <button
                  onClick={() => navigate('/settings')}
                  className="text-orange-400 hover:text-orange-300 transition-colors"
                >
                  Settings
                </button>
                , pick a provider, and paste your API key. OpenRouter is recommended — one key gives you access to models from OpenAI, Anthropic, Google, and more.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center">
              <Cpu size={16} strokeWidth={1.5} className="text-orange-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">2. Choose your model</h3>
              <p className="text-sm text-slate-400 mt-1">
                Pick a default model from the recommended list or paste any model ID. The preset works well for most use cases.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center">
              <Mic size={16} strokeWidth={1.5} className="text-orange-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">3. Start a session</h3>
              <p className="text-sm text-slate-400 mt-1">
                Click{' '}
                <button
                  onClick={() => navigate('/new')}
                  className="text-orange-400 hover:text-orange-300 transition-colors"
                >
                  New Session
                </button>
                , hit Record on the Dashboard, speak, and stop — notes are generated automatically.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Core Concepts */}
      <div className="glass rounded-xl p-4 md:p-6 mt-8">
        <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          Core Concepts
        </span>
        <p className="text-sm text-slate-400 mt-1">The building blocks of EchoBridge.</p>

        <div className="mt-6 space-y-5">
          <div className="flex gap-4">
            <Layers size={18} strokeWidth={1.5} className="text-slate-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Lens</h3>
              <p className="text-sm text-slate-400 mt-0.5">
                An AI prompt template that interprets your transcript — meeting notes, action items, decision log, and more. Pick one when you run an interpretation.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <Box size={18} strokeWidth={1.5} className="text-slate-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Socket</h3>
              <p className="text-sm text-slate-400 mt-0.5">
                A structured output format for agent integrations. Sockets define a JSON schema that AI output must follow, so external tools can consume it reliably.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <BookOpen size={18} strokeWidth={1.5} className="text-slate-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Series</h3>
              <p className="text-sm text-slate-400 mt-0.5">
                A group of related sessions that share context. When you interpret a session in a series, the AI has memory of previous meetings.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <Users size={18} strokeWidth={1.5} className="text-slate-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Room</h3>
              <p className="text-sm text-slate-400 mt-0.5">
                A live meeting space where multiple participants join with a code, sharing a real-time transcript that everyone can see and interpret.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* For AI Agents */}
      <div className="glass rounded-xl p-4 md:p-6 mt-8">
        <div className="flex items-center gap-2">
          <Bot size={18} strokeWidth={1.5} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            For AI Agents
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-2">
          EchoBridge exposes a full API and MCP server for AI agents. To connect an agent:
        </p>
        <ol className="mt-3 space-y-2 text-sm text-slate-400 list-decimal list-inside">
          <li>
            Go to{' '}
            <button
              onClick={() => navigate('/settings')}
              className="text-orange-400 hover:text-orange-300 transition-colors"
            >
              Settings
            </button>
            {' '}and scroll to <span className="text-slate-300">Agent Connections</span>
          </li>
          <li>Generate an API key and copy the config snippet for your platform</li>
          <li>Paste into your agent's config (MCP client, OpenClaw, or raw REST)</li>
        </ol>
      </div>

      {/* Quick link to settings */}
      <div className="mt-8 flex justify-center">
        <button
          onClick={() => navigate('/settings')}
          className="btn-secondary inline-flex items-center gap-2 touch-target"
        >
          <Settings size={16} strokeWidth={1.5} />
          Open Settings
        </button>
      </div>
    </div>
  );
}
