import { contextLabel, formatDate, formatDurationShort } from '../lib/utils';

/**
 * Card component for the dashboard session list.
 * Glassmorphism dark theme: glass card with rounded-xl, glow on hover.
 * Status colors adapted for dark backgrounds.
 */

const STATUS_STYLES = {
  created: { dot: 'bg-slate-400', text: 'text-slate-400' },
  recording: { dot: 'bg-red-400', text: 'text-red-400' },
  transcribing: { dot: 'bg-amber-400', text: 'text-amber-400' },
  processing: { dot: 'bg-amber-400', text: 'text-amber-400' },
  complete: { dot: 'bg-green-400', text: 'text-green-400' },
  error: { dot: 'bg-red-400', text: 'text-red-400' },
  waiting: { dot: 'bg-slate-400', text: 'text-slate-400' },
  closed: { dot: 'bg-slate-400', text: 'text-slate-400' },
};

function getStatusStyle(status) {
  return STATUS_STYLES[status] || { dot: 'bg-slate-400', text: 'text-slate-400' };
}

export default function SessionCard({ session, onClick }) {
  const status = session.status;
  const showStatus = status && status !== 'complete';
  const statusStyle = getStatusStyle(status);

  return (
    <button
      onClick={() => onClick(session.id)}
      className="w-full text-left glass rounded-xl p-4 md:p-6 hover:bg-white/[0.12] hover:border-white/20 hover:shadow-glow transition-all duration-200 touch-target"
    >
      <span className="section-label">
        {contextLabel(session.context)}
      </span>

      <h3 className="mt-2 text-base font-medium text-slate-100">
        {session.title || 'Untitled Session'}
      </h3>

      <p className="mt-1 text-sm text-slate-400">
        {formatDate(session.created_at)}
        {session.duration_seconds != null && (
          <span> &middot; {formatDurationShort(session.duration_seconds)}</span>
        )}
        {session.room_code && (
          <span> &middot; Room {session.room_code}</span>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {session.series_name && (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 bg-orange-500/10 border border-orange-400/20 text-xs font-medium text-orange-300">
            {session.series_name}
          </span>
        )}
        {showStatus && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 bg-white/10 text-xs font-medium ${statusStyle.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
            {status}
          </span>
        )}
      </div>
    </button>
  );
}
