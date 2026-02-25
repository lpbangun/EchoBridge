import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MessageSquare } from 'lucide-react';
import { listSessions, searchSessions } from '../lib/api';
import { useSearch } from '../components/AppLayout';
import SessionCard from '../components/SessionCard';
import { contextLabel } from '../lib/utils';

const FILTERS = [
  { id: null, label: 'All' },
  { id: 'class_lecture', label: null },
  { id: 'startup_meeting', label: null },
  { id: 'research_discussion', label: null },
  { id: 'working_session', label: null },
  { id: 'talk_seminar', label: null },
];

export default function RecordingsPage() {
  const navigate = useNavigate();
  const { query: searchQuery } = useSearch();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [contextFilter, setContextFilter] = useState(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result;
      if (searchQuery?.trim()) {
        result = await searchSessions(searchQuery.trim());
      } else {
        result = await listSessions({ context: contextFilter });
      }
      setSessions(Array.isArray(result) ? result : result?.sessions || []);
    } catch (err) {
      setError(err.message || 'Failed to load recordings.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, contextFilter]);

  useEffect(() => {
    const timeout = setTimeout(fetchSessions, searchQuery ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [fetchSessions, searchQuery]);

  const activeStatuses = ['recording', 'transcribing', 'processing'];
  const sortedSessions = [...sessions].sort((a, b) => {
    const aActive = activeStatuses.includes(a.status) ? 0 : 1;
    const bActive = activeStatuses.includes(b.status) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return 0;
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="font-display text-xl font-bold text-white">Recordings</h1>
      <p className="text-sm text-zinc-400 mt-1">All your recorded sessions.</p>

      {/* Filter chips */}
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const isActive =
            filter.id === contextFilter ||
            (filter.id === null && contextFilter === null);
          const label = filter.label || contextLabel(filter.id);
          return (
            <button
              key={filter.id || 'all'}
              onClick={() => setContextFilter(filter.id)}
              className={isActive ? 'chip-active' : 'chip-inactive'}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Session list */}
      <div className="mt-6">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="h-3 bg-zinc-800 rounded w-24" />
                <div className="h-4 bg-zinc-800 rounded w-2/3 mt-3" />
                <div className="h-3 bg-zinc-800 rounded w-1/3 mt-2" />
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {!loading && !error && sessions.length === 0 && (
          <div className="card-lg p-10 flex flex-col items-center text-center">
            <MessageSquare size={32} strokeWidth={1.5} className="text-zinc-500 mb-3" />
            <p className="text-sm font-medium text-zinc-300">No recordings yet</p>
            <p className="text-xs text-zinc-500 mt-1">Start a recording to see it here.</p>
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="grid gap-3">
            {sortedSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onClick={(id) => navigate(`/session/${id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
