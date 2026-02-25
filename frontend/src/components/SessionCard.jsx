import { ChevronRight } from 'lucide-react';
import { contextLabel, formatDate, formatDurationShort } from '../lib/utils';

const STATUS_STYLES = {
  created: { dot: 'bg-zinc-500', text: 'text-zinc-400' },
  recording: { dot: 'bg-red-400', text: 'text-red-400' },
  transcribing: { dot: 'bg-amber-400', text: 'text-amber-400' },
  processing: { dot: 'bg-amber-400', text: 'text-amber-400' },
  complete: { dot: 'bg-green-400', text: 'text-green-400' },
  error: { dot: 'bg-red-400', text: 'text-red-400' },
  waiting: { dot: 'bg-zinc-500', text: 'text-zinc-400' },
  closed: { dot: 'bg-zinc-500', text: 'text-zinc-400' },
};

const STATUS_LABELS = {
  recording: 'Recording...',
  transcribing: 'Transcribing...',
  processing: 'Generating notes...',
};

function getStatusStyle(status) {
  return STATUS_STYLES[status] || { dot: 'bg-zinc-500', text: 'text-zinc-400' };
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export default function SessionCard({ session, onClick }) {
  const status = session.status;
  const showStatus = status && status !== 'complete';
  const statusStyle = getStatusStyle(status);
  const isActive = status === 'recording' || status === 'transcribing' || status === 'processing';

  return (
    <button
      onClick={() => onClick(session.id)}
      className={`w-full text-left p-5 transition-all duration-200 touch-target flex items-center justify-between group ${
        isActive ? 'card-active' : 'card hover:border-border-hover'
      }`}
    >
      <div className="min-w-0 flex-1">
        <span className="section-label">
          {contextLabel(session.context)}
        </span>

        <h3 className="mt-2 font-display text-base font-bold text-white truncate">
          {session.title || 'Untitled Session'}
        </h3>

        {session.summary_snippet && (
          <p className="mt-1 text-sm text-zinc-400 line-clamp-2">
            {session.summary_snippet}
          </p>
        )}

        <p className="mt-1 font-mono text-[11px] text-zinc-600">
          {formatDate(session.created_at)}
          {session.duration_seconds != null && (
            <span> &middot; {formatDurationShort(session.duration_seconds)}</span>
          )}
          {session.room_code && (
            <span> &middot; Room {session.room_code}</span>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2 mt-2">
          {session.series_name && (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 bg-accent-muted border border-accent-border text-xs font-medium text-accent">
              {session.series_name}
            </span>
          )}
          {showStatus && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 bg-zinc-800 text-xs font-medium ${statusStyle.text}`}>
              {isActive && (
                <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot} animate-pulse`} />
              )}
              {!isActive && (
                <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
              )}
              {getStatusLabel(status)}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} strokeWidth={1.5} className="text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0 ml-4" />
    </button>
  );
}
