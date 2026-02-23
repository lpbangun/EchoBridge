import { contextLabel, formatDate, formatDurationShort, statusColor } from '../lib/utils';

/**
 * Card component for the dashboard session list.
 * Follows DESIGN.md card style: 1px neutral-200 border, no background,
 * no rounded corners, no shadows, hover to neutral-400.
 */
export default function SessionCard({ session, onClick }) {
  const status = session.status;
  const showStatus = status && status !== 'complete';

  return (
    <button
      onClick={() => onClick(session.id)}
      className="w-full text-left p-6 border border-neutral-200 hover:border-neutral-400 transition-colors"
    >
      <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
        {contextLabel(session.context)}
      </span>

      <h3 className="mt-2 text-base font-medium text-neutral-900">
        {session.title || 'Untitled Session'}
      </h3>

      <p className="mt-1 text-sm text-neutral-500">
        {formatDate(session.created_at)}
        {session.duration_seconds != null && (
          <span> &middot; {formatDurationShort(session.duration_seconds)}</span>
        )}
        {session.room_code && (
          <span> &middot; Room {session.room_code}</span>
        )}
      </p>

      {showStatus && (
        <span className={`inline-block mt-2 text-xs font-medium tracking-wide ${statusColor(status)}`}>
          {status}
        </span>
      )}
    </button>
  );
}
