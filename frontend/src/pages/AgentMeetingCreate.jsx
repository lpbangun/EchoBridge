import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Bot } from 'lucide-react';
import { createAgentMeeting, listSockets, getSettings } from '../lib/api';
import AgentPersonaCard from '../components/AgentPersonaCard';

const DEFAULT_AGENT = { name: '', type: 'internal', socket_id: null, persona_prompt: '', model: null };

export default function AgentMeetingCreate() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [title, setTitle] = useState('');
  const [agents, setAgents] = useState([
    { ...DEFAULT_AGENT, name: 'Agent A' },
    { ...DEFAULT_AGENT, name: 'Agent B' },
  ]);
  const [cooldown, setCooldown] = useState(3);
  const [maxRounds, setMaxRounds] = useState(20);
  const [sockets, setSockets] = useState([]);
  const [hostName, setHostName] = useState('Host');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    listSockets().then((s) => setSockets(Array.isArray(s) ? s : [])).catch(() => {});
    getSettings().then((s) => {
      if (s.user_display_name) setHostName(s.user_display_name);
    }).catch(() => {});
  }, []);

  function updateAgent(index, updated) {
    const next = [...agents];
    next[index] = updated;
    setAgents(next);
  }

  function removeAgent(index) {
    if (agents.length <= 2) return;
    setAgents(agents.filter((_, i) => i !== index));
  }

  function addAgent() {
    if (agents.length >= 4) return;
    setAgents([...agents, { ...DEFAULT_AGENT, name: `Agent ${String.fromCharCode(65 + agents.length)}` }]);
  }

  async function handleCreate() {
    setError(null);
    if (!topic.trim()) {
      setError('Topic is required.');
      return;
    }
    const emptyNames = agents.some((a) => !a.name.trim());
    if (emptyNames) {
      setError('All agents must have names.');
      return;
    }

    setCreating(true);
    try {
      const result = await createAgentMeeting({
        topic: topic.trim(),
        host_name: hostName,
        agents: agents.map((a) => ({
          name: a.name.trim(),
          type: a.type || 'internal',
          socket_id: a.socket_id || undefined,
          persona_prompt: a.persona_prompt?.trim() || undefined,
          model: a.model?.trim() || undefined,
        })),
        task_description: taskDescription.trim(),
        cooldown_seconds: cooldown,
        max_rounds: maxRounds,
        title: title.trim() || undefined,
      });
      navigate(`/meeting/${result.code}`);
    } catch (err) {
      setError(err.message || 'Failed to create meeting.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 safe-area-inset">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bot size={20} className="text-accent" strokeWidth={1.5} />
        <h1 className="font-display text-xl font-bold text-white">
          AGENT MEETING
        </h1>
      </div>

      <p className="mt-6 text-sm text-zinc-400">
        Set up an AI-only discussion room. Configure 2-4 agents to debate a topic
        while you observe, direct, and optionally participate.
      </p>

      {/* Form */}
      <div className="mt-8 card-lg p-6 md:p-8 space-y-8">
        {/* Topic */}
        <div>
          <label className="section-label">Topic</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What should the agents discuss?"
            className="mt-2 eb-input w-full text-base px-4 py-3"
          />
        </div>

        {/* Task description */}
        <div>
          <label className="section-label">Task Description</label>
          <textarea
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            placeholder="Optional: specific instructions for the discussion (e.g., 'Compare pros and cons, then reach a recommendation')"
            rows={3}
            className="mt-2 eb-input w-full text-sm px-4 py-3 resize-none"
          />
        </div>

        {/* Title override */}
        <div>
          <label className="section-label">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Auto-generated from topic if empty"
            className="mt-2 eb-input w-full text-sm px-4 py-3"
          />
        </div>

        {/* Agents */}
        <div>
          <div className="flex items-center justify-between">
            <label className="section-label">Agents ({agents.length}/4)</label>
            {agents.length < 4 && (
              <button
                onClick={addAgent}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors font-medium"
              >
                <Plus size={14} />
                Add Agent
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="p-3 border border-[#27272A]">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Internal</span>
              <p className="text-[11px] text-zinc-500 mt-1">
                Simulated by EchoBridge&apos;s AI. Responds automatically each round using the configured model and persona.
              </p>
            </div>
            <div className="p-3 border border-[#27272A]">
              <span className="text-xs font-mono text-amber-400 uppercase tracking-wider">External</span>
              <p className="text-[11px] text-zinc-500 mt-1">
                A real agent connecting via API. The meeting pauses at this agent&apos;s turn until a response arrives.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {agents.map((agent, i) => (
              <AgentPersonaCard
                key={i}
                index={i}
                agent={agent}
                onChange={(updated) => updateAgent(i, updated)}
                onRemove={() => removeAgent(i)}
                sockets={sockets}
                canRemove={agents.length > 2}
              />
            ))}
          </div>
        </div>

        {/* Settings */}
        <div>
          <label className="section-label">Settings</label>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-500">Cooldown (seconds)</label>
              <input
                type="number"
                min={1}
                max={30}
                value={cooldown}
                onChange={(e) => setCooldown(Number(e.target.value))}
                className="mt-1 eb-input w-full text-sm px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Max Rounds</label>
              <input
                type="number"
                min={5}
                max={100}
                value={maxRounds}
                onChange={(e) => setMaxRounds(Number(e.target.value))}
                className="mt-1 eb-input w-full text-sm px-3 py-2"
              />
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            Estimated API calls: ~{agents.filter((a) => a.type !== 'external').length * maxRounds} (internal agents x rounds).
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={creating}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 w-full justify-center touch-target"
        >
          <Play size={16} strokeWidth={1.5} />
          {creating ? 'Creating...' : 'Create Meeting'}
        </button>
      </div>
    </div>
  );
}
