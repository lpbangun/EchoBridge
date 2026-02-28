import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Zap, Loader2, Check, X } from 'lucide-react';
import MarkdownPreview from './MarkdownPreview';
import { listWebhooks, executeWebhook } from '../lib/api';

export default function InterpretationCard({ interpretation }) {
  const [expanded, setExpanded] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [webhooks, setWebhooks] = useState([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [actionItems, setActionItems] = useState([]);
  const [itemStates, setItemStates] = useState({});

  const sourceLabel = interpretation.source_type === 'agent'
    ? `Agent: ${interpretation.source_name || 'Unknown'}`
    : interpretation.source_name || 'You';

  const lensLabel = interpretation.lens_type === 'socket'
    ? `${interpretation.lens_id} socket`
    : interpretation.lens_type === 'preset'
    ? `${interpretation.lens_id} lens`
    : 'Custom lens';

  const hasStructured = interpretation.lens_type === 'socket'
    && interpretation.output_structured
    && typeof interpretation.output_structured === 'object';

  // Extract actionable items from structured output
  useEffect(() => {
    if (!hasStructured) return;
    const structured = interpretation.output_structured;
    const items = [];

    // Look for common structured data patterns: action_items, tasks, todos, items
    const candidates = [
      structured.action_items,
      structured.tasks,
      structured.todos,
      structured.items,
      structured.actions,
      structured.next_steps,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        candidate.forEach((item, i) => {
          const label = item.title || item.text || item.description || item.action || item.task || JSON.stringify(item);
          const owner = item.owner || item.assignee || item.assigned_to || null;
          items.push({ id: `item-${i}`, label, owner, raw: item });
        });
        break;
      }
    }

    // If no known array key, check if the structured output itself is an array
    if (items.length === 0 && Array.isArray(structured)) {
      structured.forEach((item, i) => {
        const label = typeof item === 'string' ? item : (item.title || item.text || item.description || JSON.stringify(item));
        const owner = typeof item === 'object' ? (item.owner || item.assignee || null) : null;
        items.push({ id: `item-${i}`, label, owner, raw: item });
      });
    }

    setActionItems(items);
  }, [hasStructured, interpretation.output_structured]);

  async function handleOpenActions() {
    setActionsOpen(true);
    setWebhooksLoading(true);
    try {
      const data = await listWebhooks();
      setWebhooks((data.webhooks || []).filter(w => w.enabled));
    } catch {
      setWebhooks([]);
    } finally {
      setWebhooksLoading(false);
    }
  }

  async function handleExecute(itemId, webhookId) {
    const stateKey = `${itemId}-${webhookId}`;
    setItemStates(prev => ({ ...prev, [stateKey]: 'loading' }));

    const item = actionItems.find(a => a.id === itemId);
    try {
      await executeWebhook({
        webhook_id: webhookId,
        payload: item?.raw || {},
        interpretation_id: interpretation.id,
      });
      setItemStates(prev => ({ ...prev, [stateKey]: 'success' }));
    } catch {
      setItemStates(prev => ({ ...prev, [stateKey]: 'error' }));
    }
  }

  return (
    <div className="card overflow-hidden transition-all duration-200 hover:border-border-hover">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 md:p-6 flex items-start justify-between touch-target"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-white">
              {sourceLabel}
            </span>
            {interpretation.is_primary && (
              <span className="rounded-full px-2.5 py-0.5 bg-accent-muted text-accent text-xs">
                Primary
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            {lensLabel}
            {interpretation.model && (
              <span> &middot; {interpretation.model}</span>
            )}
          </p>
        </div>
        {expanded ? (
          <ChevronDown size={20} strokeWidth={1.5} className="text-zinc-400 mt-1" />
        ) : (
          <ChevronRight size={20} strokeWidth={1.5} className="text-zinc-400 mt-1" />
        )}
      </button>
      {expanded && (
        <div className="px-4 md:px-6 pb-4 md:pb-6 border-t border-border pt-4">
          <MarkdownPreview content={interpretation.output_markdown} />

          {/* Run Actions button for socket interpretations with structured output */}
          {hasStructured && actionItems.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              {!actionsOpen ? (
                <button
                  onClick={handleOpenActions}
                  className="btn-secondary inline-flex items-center gap-2 text-sm touch-target"
                >
                  <Zap size={16} strokeWidth={1.5} />
                  Run Actions ({actionItems.length})
                </button>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                      Actionable Items
                    </span>
                    <button
                      onClick={() => setActionsOpen(false)}
                      className="text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <X size={16} strokeWidth={1.5} />
                    </button>
                  </div>

                  {webhooksLoading ? (
                    <p className="text-sm text-zinc-500">Loading webhooks...</p>
                  ) : webhooks.length === 0 ? (
                    <p className="text-sm text-zinc-500">
                      No webhooks configured. Add webhooks in Settings to execute actions.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {actionItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 bg-zinc-900/40 border border-zinc-700"
                        >
                          <p className="text-sm text-zinc-300">{item.label}</p>
                          {item.owner && (
                            <p className="text-xs text-zinc-500 mt-1">
                              Owner: {item.owner}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {webhooks.map((wh) => {
                              const stateKey = `${item.id}-${wh.id}`;
                              const state = itemStates[stateKey];
                              return (
                                <button
                                  key={wh.id}
                                  onClick={() => handleExecute(item.id, wh.id)}
                                  disabled={state === 'loading'}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors touch-target ${
                                    state === 'success'
                                      ? 'bg-green-900/30 text-green-400 border border-green-700'
                                      : state === 'error'
                                      ? 'bg-red-900/30 text-red-400 border border-red-700'
                                      : 'border border-zinc-600 text-zinc-300 hover:border-zinc-400 hover:text-white'
                                  } disabled:opacity-50`}
                                >
                                  {state === 'loading' ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : state === 'success' ? (
                                    <Check size={12} strokeWidth={2} />
                                  ) : state === 'error' ? (
                                    <X size={12} strokeWidth={2} />
                                  ) : (
                                    <Zap size={12} strokeWidth={1.5} />
                                  )}
                                  {wh.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
