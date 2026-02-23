import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Plus, MessageSquare, Key } from 'lucide-react';
import { listSessions, searchSessions, getSettings } from '../lib/api';
import SessionCard from '../components/SessionCard';
import SearchBar from '../components/SearchBar';

export default function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextFilter, setContextFilter] = useState(null);
  const [needsApiKey, setNeedsApiKey] = useState(false);

  // Check if API key is set
  useEffect(() => {
    getSettings()
      .then((settings) => {
        setNeedsApiKey(!settings.openrouter_api_key_set);
      })
      .catch(() => {});
  }, []);

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
    <div className="max-w-5xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="glass rounded-xl px-6 py-4 flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold tracking-tight text-slate-50"
            style={{ textShadow: '0 0 20px rgba(129, 140, 248, 0.3)' }}
          >
            ECHOBRIDGE
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Record conversations, get AI-powered notes.</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/settings')}
            className="text-slate-400 hover:text-indigo-400 transition-colors"
            aria-label="Settings"
          >
            <Settings size={20} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => navigate('/new')}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus size={16} strokeWidth={1.5} />
            New
          </button>
        </div>
      </div>

      {/* Setup banner */}
      {needsApiKey && (
        <div className="glass rounded-xl p-4 mt-6 flex items-center gap-3">
          <Key size={20} strokeWidth={1.5} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-400 flex-1">Set up your API key to enable AI-powered notes.</p>
          <button
            onClick={() => navigate('/settings')}
            className="btn-secondary text-xs whitespace-nowrap"
          >
            Go to Settings
          </button>
        </div>
      )}

      {/* Search + context filter */}
      <div className="mt-8">
        <SearchBar
          onSearch={(q) => setSearchQuery(q)}
          onFilterChange={(id) => {
            setContextFilter(id);
            setSearchQuery('');
          }}
          activeFilter={contextFilter}
        />
      </div>

      {/* Session list */}
      <div className="mt-8">
        {loading && (
          <p className="text-sm text-slate-500">Loading...</p>
        )}

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="glass rounded-xl p-12 flex flex-col items-center text-center">
            <MessageSquare size={40} strokeWidth={1.5} className="text-slate-500 mb-4" />
            <p className="text-base font-medium text-slate-300">No sessions yet</p>
            <p className="mt-1 text-sm text-slate-500 max-w-md">
              Record a meeting, upload an audio file, or create a live room. EchoBridge transcribes and summarizes everything for you.
            </p>
            <button
              onClick={() => navigate('/new')}
              className="btn-primary inline-flex items-center gap-2 mt-6"
            >
              <Plus size={16} strokeWidth={1.5} />
              New Session
            </button>
          </div>
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
