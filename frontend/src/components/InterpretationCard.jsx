import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import MarkdownPreview from './MarkdownPreview';

export default function InterpretationCard({ interpretation }) {
  const [expanded, setExpanded] = useState(false);

  const sourceLabel = interpretation.source_type === 'agent'
    ? `Agent: ${interpretation.source_name || 'Unknown'}`
    : interpretation.source_name || 'You';

  const lensLabel = interpretation.lens_type === 'socket'
    ? `${interpretation.lens_id} socket`
    : interpretation.lens_type === 'preset'
    ? `${interpretation.lens_id} lens`
    : 'Custom lens';

  return (
    <div className="glass rounded-xl overflow-hidden transition-all duration-200 hover:border-white/20">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 md:p-6 flex items-start justify-between touch-target"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-slate-100">
              {sourceLabel}
            </span>
            {interpretation.is_primary && (
              <span className="rounded-full px-2.5 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs">
                Primary
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {lensLabel}
            {interpretation.model && (
              <span> &middot; {interpretation.model}</span>
            )}
          </p>
        </div>
        {expanded ? (
          <ChevronDown size={20} strokeWidth={1.5} className="text-slate-500 mt-1" />
        ) : (
          <ChevronRight size={20} strokeWidth={1.5} className="text-slate-500 mt-1" />
        )}
      </button>
      {expanded && (
        <div className="px-4 md:px-6 pb-4 md:pb-6 border-t border-white/10 pt-4">
          <MarkdownPreview content={interpretation.output_markdown} />
        </div>
      )}
    </div>
  );
}
