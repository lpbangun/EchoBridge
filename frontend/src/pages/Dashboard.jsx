import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Plus, MessageSquare, Key, CloudOff, RefreshCw } from 'lucide-react';
import { listSessions, searchSessions, getSettings } from '../lib/api';
import { getPendingCount } from '../lib/offlineStorage';
import { syncPendingRecordings, onSyncStatusChange } from '../lib/syncManager';
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
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Check if API key is set
  useEffect(() => {
    getSettings()
      .then((settings) => {
        setNeedsApiKey(!settings.openrouter_api_key_set);
      })
      .catch(() => {});
  }, []);

  // Check for pending offline recordings
  useEffect(() => {
    getPendingCount()
      .then(setPendingCount)
      .catch(() => {});

    const unsubscribe = onSyncStatusChange((status) => {
      setSyncing(status.syncing);
      if (!status.syncing) {
        getPendingCount()
          .then(setPendingCount)
          .catch(() => {});
      }
    });

    return unsubscribe;
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

  function handleSync() {
    syncPendingRecordings();
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-12 safe-area-inset">
      {/* Header */}
      <div className="glass rounded-xl px-4 py-3 md:px-6 md:py-4 flex items-center justify-between gap-4">
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
            className="text-slate-400 hover:text-indigo-400 transition-colors touch-target inline-flex items-center justify-center"
            aria-label="Settings"
          >
            <Settings size={20} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => navigate('/new')}
            className="btn-primary inline-flex items-center gap-2 touch-target"
          >
            <Plus size={16} strokeWidth={1.5} />
            New
          </button>
        </div>
      </div>

      {/* Pending offline recordings banner */}
      {pendingCount > 0 && (
        <div className="glass rounded-xl p-4 mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <CloudOff size={20} strokeWidth={1.5} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-400 flex-1">
            {pendingCount} recording{pendingCount !== 1 ? 's' : ''} saved offline, waiting to sync.
          </p>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-secondary text-xs whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <RefreshCw size={14} strokeWidth={1.5} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      )}

      {/* Setup banner */}
      {needsApiKey && (
        <div className="glass rounded-xl p-4 mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
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
          <div className="glass rounded-xl p-8 md:p-12 flex flex-col items-center text-center">
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
