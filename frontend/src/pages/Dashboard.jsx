import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Plus } from 'lucide-react';
import { listSessions, searchSessions } from '../lib/api';
import { contextLabel } from '../lib/utils';
import SessionCard from '../components/SessionCard';
import SearchBar from '../components/SearchBar';

const CONTEXTS = [
  { id: null, label: 'All' },
  { id: 'class_lecture', label: 'Class Lecture' },
  { id: 'startup_meeting', label: 'Startup Meeting' },
  { id: 'research_discussion', label: 'Research' },
  { id: 'working_session', label: 'Working Session' },
  { id: 'talk_seminar', label: 'Talk / Seminar' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextFilter, setContextFilter] = useState(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result;
      if (searchQuery.trim()) {
        result = await searchSessions(searchQuery.trim());
      } else {
        result = await listSessions({ context: contextFilter });
      }
      setSessions(Array.isArray(result) ? result : result?.sessions || []);
    } catch (err) {
      setError(err.message || 'Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, contextFilter]);

  useEffect(() => {
    const timeout = setTimeout(fetchSessions, searchQuery ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [fetchSessions, searchQuery]);

  function handleSessionClick(id) {
    navigate(`/session/${id}`);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">
          ECHOBRIDGE
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/settings')}
            className="text-neutral-500 hover:text-neutral-700 transition-colors"
            aria-label="Settings"
          >
            <Settings size={20} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => navigate('/new')}
            className="bg-neutral-900 text-white text-sm font-medium px-5 py-2.5 hover:bg-neutral-800 transition-colors inline-flex items-center gap-2"
          >
            <Plus size={16} strokeWidth={1.5} />
            New
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mt-8">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search sessions..."
        />
      </div>

      {/* Context filter chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {CONTEXTS.map((ctx) => (
          <button
            key={ctx.id || 'all'}
            onClick={() => {
              setContextFilter(ctx.id);
              setSearchQuery('');
            }}
            className={`text-xs font-medium tracking-wide px-2.5 py-1 border transition-colors ${
              contextFilter === ctx.id
                ? 'border-neutral-900 text-neutral-900'
                : 'border-neutral-200 text-neutral-600 hover:border-neutral-400'
            }`}
          >
            {ctx.label}
          </button>
        ))}
      </div>

      {/* Session list */}
      <div className="mt-8">
        {loading && (
          <p className="text-sm text-neutral-500">Loading...</p>
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {!loading && !error && sessions.length === 0 && (
          <p className="text-sm text-neutral-500">
            No sessions yet. Create one to get started.
          </p>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="grid gap-4">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onClick={handleSessionClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
