import { Users, Bot, X } from 'lucide-react';

/**
 * ParticipantList displays room participants.
 * Props:
 *  - participants: array of { name, participant_type, agent_name }
 *  - hostName: string
 *  - isHost: boolean — whether the current user is the room host
 *  - onKick: (agentName) => void — callback to kick an agent
 */
export default function ParticipantList({ participants, hostName, isHost, onKick }) {
  if (!participants || participants.length === 0) {
    return (
      <div>
        <span className="section-label">
          Participants
        </span>
        <p className="mt-2 text-sm text-zinc-400">No participants yet.</p>
      </div>
    );
  }

  return (
    <div>
      <span className="section-label">
        Participants
      </span>
      <div className="mt-2 flex flex-wrap gap-2">
        {participants.map((p, i) => (
          <span
            key={i}
            className="bg-zinc-800 border border-border rounded-full px-3 py-1.5 inline-flex items-center gap-2 text-sm text-zinc-300 touch-target"
          >
            {p.participant_type === 'agent' ? (
              <Bot size={14} strokeWidth={1.5} className="text-accent" />
            ) : (
              <Users size={14} strokeWidth={1.5} className="text-zinc-400" />
            )}
            {p.name}
            {p.name === hostName && (
              <span className="text-xs text-accent">(host)</span>
            )}
            {p.participant_type === 'agent' && isHost && onKick && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onKick(p.name);
                }}
                className="text-zinc-500 hover:text-red-500 transition-colors ml-1"
                aria-label={`Kick ${p.name}`}
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
