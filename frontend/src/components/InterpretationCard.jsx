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
    <div className="border border-neutral-200 hover:border-neutral-400 transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-6 flex items-start justify-between"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-neutral-900">
              {sourceLabel}
            </span>
            {interpretation.is_primary && (
              <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
                Primary
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {lensLabel}
            {interpretation.model && (
              <span> &middot; {interpretation.model}</span>
            )}
          </p>
        </div>
        {expanded ? (
          <ChevronDown size={20} strokeWidth={1.5} className="text-neutral-500 mt-1" />
        ) : (
          <ChevronRight size={20} strokeWidth={1.5} className="text-neutral-500 mt-1" />
        )}
      </button>
      {expanded && (
        <div className="px-6 pb-6 border-t border-neutral-200 pt-4">
          <MarkdownPreview content={interpretation.output_markdown} />
        </div>
      )}
    </div>
  );
}
