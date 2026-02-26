import { useState } from 'react';
import { ChevronDown, ChevronUp, X, Plug } from 'lucide-react';

const AGENT_COLORS = ['#C4F82A', '#F59E0B', '#38BDF8', '#A78BFA'];

export default function AgentPersonaCard({
  index,
  agent,
  onChange,
  onRemove,
  sockets = [],
  canRemove = true,
}) {
  const [expanded, setExpanded] = useState(false);
  const color = AGENT_COLORS[index % AGENT_COLORS.length];

  function update(field, value) {
    onChange({ ...agent, [field]: value });
  }

  return (
    <div className="card p-4 border-border">
      <div className="flex items-center gap-3">
        {/* Color dot */}
        <div
          className="w-3 h-3 flex-shrink-0"
          style={{ backgroundColor: color }}
        />

        {/* Name input */}
        <input
          type="text"
          value={agent.name || ''}
          onChange={(e) => update('name', e.target.value)}
          placeholder={`Agent ${index + 1} name`}
          className="eb-input flex-1 text-sm px-3 py-2"
        />

        {/* Type badge */}
        <span
          className={`text-xs font-mono uppercase tracking-wider shrink-0 ${
            agent.type === 'external' ? 'text-amber-400' : 'text-zinc-400'
          }`}
          title={
            agent.type === 'external'
              ? 'External: A real agent connecting via API — waits for responses from an external system'
              : "Internal: Simulated by EchoBridge's AI — participates automatically"
          }
        >
          {agent.type === 'external' ? 'EXTERNAL' : 'INTERNAL'}
        </span>

        {/* Expand/collapse */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Remove */}
        {canRemove && (
          <button
            onClick={onRemove}
            className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {/* Agent type */}
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
              Type
            </label>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => update('type', 'internal')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  agent.type !== 'external'
                    ? 'bg-accent text-zinc-900'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                Internal
              </button>
              <button
                onClick={() => update('type', 'external')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  agent.type === 'external'
                    ? 'bg-accent text-zinc-900'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                External (API)
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 mt-2">
              {agent.type === 'external'
                ? "External: A real agent connecting via the API. EchoBridge pauses at this agent's turn until a response is submitted."
                : "Internal: Simulated by EchoBridge's AI using the configured model. Participates automatically."}
            </p>
          </div>

          {/* Socket selector (only for internal agents) */}
          {agent.type !== 'external' && sockets.length > 0 && (
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider font-medium flex items-center gap-1">
                <Plug size={12} />
                Socket Persona
              </label>
              <p className="text-[11px] text-zinc-500 mt-1">
                Assign a socket to give this agent a specific persona and expertise.
              </p>
              <select
                value={agent.socket_id || ''}
                onChange={(e) => update('socket_id', e.target.value || null)}
                className="mt-2 eb-input w-full text-sm px-3 py-2"
              >
                <option value="">None (generic agent)</option>
                {sockets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Custom persona prompt */}
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
              Persona Prompt
            </label>
            <textarea
              value={agent.persona_prompt || ''}
              onChange={(e) => update('persona_prompt', e.target.value)}
              placeholder="Optional: describe this agent's personality, expertise, or role..."
              rows={3}
              className="mt-2 eb-input w-full text-sm px-3 py-2 resize-none"
            />
          </div>

          {/* Model override */}
          {agent.type !== 'external' && (
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
                Model Override
              </label>
              <input
                type="text"
                value={agent.model || ''}
                onChange={(e) => update('model', e.target.value || null)}
                placeholder="Leave empty for default model"
                className="mt-2 eb-input w-full text-sm px-3 py-2"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
