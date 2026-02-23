import { Users, Bot } from 'lucide-react';

/**
 * ParticipantList displays room participants.
 * Props:
 *  - participants: array of { name, participant_type, agent_name }
 *  - hostName: string
 */
export default function ParticipantList({ participants, hostName }) {
  if (!participants || participants.length === 0) {
    return (
      <div>
        <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
          Participants
        </span>
        <p className="mt-2 text-sm text-neutral-400">No participants yet.</p>
      </div>
    );
  }

  return (
    <div>
      <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
        Participants
      </span>
      <div className="mt-2 flex flex-wrap gap-2">
        {participants.map((p, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 text-sm text-neutral-600"
          >
            {p.participant_type === 'agent' ? (
              <Bot size={14} strokeWidth={1.5} className="text-neutral-500" />
            ) : (
              <Users size={14} strokeWidth={1.5} className="text-neutral-500" />
            )}
            {p.name}
            {p.name === hostName && (
              <span className="text-xs text-neutral-400">(host)</span>
            )}
            {i < participants.length - 1 && (
              <span className="text-neutral-300 ml-1">&middot;</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
