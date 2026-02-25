import { Mic, Brain, FolderOutput } from 'lucide-react';

const FEATURES = [
  {
    icon: Mic,
    label: 'Record or Upload',
    description: 'Capture audio from any meeting, lecture, or conversation.',
  },
  {
    icon: Brain,
    label: 'AI-Powered Notes',
    description: 'Transcription + intelligent summarization with customizable lenses.',
  },
  {
    icon: FolderOutput,
    label: 'Export Anywhere',
    description: 'Obsidian, local folders, or connect your AI agent directly.',
  },
];

export default function WelcomeLanding({ onGetStarted, onSkip }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 safe-area-inset">
      <div className="w-full max-w-lg text-center">
        <h1
          className="text-3xl font-bold tracking-tight text-white mb-3"
        >
          ECHOBRIDGE
        </h1>
        <p className="text-base text-zinc-300 mb-10">
          Turn meetings into structured, AI-powered notes.
        </p>

        <div className="card-lg p-6 text-left">
          <div className="space-y-5">
            {FEATURES.map((feat) => (
              <div key={feat.label} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent-muted border border-accent-border flex items-center justify-center flex-shrink-0">
                  <feat.icon size={18} strokeWidth={1.5} className="text-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">{feat.label}</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{feat.description}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onGetStarted}
            className="btn-primary w-full mt-8"
          >
            Get Started
          </button>

          <button
            onClick={onSkip}
            className="w-full mt-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            I've used EchoBridge before
          </button>
        </div>
      </div>
    </div>
  );
}
