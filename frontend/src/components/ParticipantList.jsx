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
        <span className="section-label">
          Participants
        </span>
        <p className="mt-2 text-sm text-slate-500">No participants yet.</p>
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
            className="glass rounded-full px-3 py-1.5 inline-flex items-center gap-2 text-sm text-slate-300 touch-target"
          >
            {p.participant_type === 'agent' ? (
              <Bot size={14} strokeWidth={1.5} className="text-orange-400" />
            ) : (
              <Users size={14} strokeWidth={1.5} className="text-slate-400" />
            )}
            {p.name}
            {p.name === hostName && (
              <span className="text-xs text-orange-400">(host)</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
