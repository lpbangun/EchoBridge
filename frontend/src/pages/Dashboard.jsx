import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Upload, MessageSquare, Key, CloudOff, RefreshCw, BookOpen, Mic, Users } from 'lucide-react';
import { listSessions, searchSessions, getSettings, listSeries, createSession } from '../lib/api';
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
  const [seriesList, setSeriesList] = useState([]);
  const [seriesFilter, setSeriesFilter] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [creatingRecord, setCreatingRecord] = useState(false);
  const pollIntervalRef = useRef(null);

  // Check if API key is set and load series
  useEffect(() => {
    getSettings()
      .then((settings) => {
        const providerKeyMap = {
          openrouter: 'openrouter_api_key_set',
          openai: 'openai_api_key_set',
          anthropic: 'anthropic_api_key_set',
          google: 'google_api_key_set',
          xai: 'xai_api_key_set',
        };
        const keyField = providerKeyMap[settings.ai_provider] || 'openrouter_api_key_set';
        setNeedsApiKey(!settings[keyField]);
      })
      .catch(() => {});
    listSeries()
      .then((data) => setSeriesList(Array.isArray(data) ? data : []))
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
        result = await listSessions({
          context: contextFilter,
          series_id: seriesFilter,
        });
      }
      setSessions(Array.isArray(result) ? result : result?.sessions || []);
    } catch (err) {
      setError(err.message || 'Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, contextFilter, seriesFilter]);

  useEffect(() => {
    const timeout = setTimeout(fetchSessions, searchQuery ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [fetchSessions, searchQuery]);

  // Poll for updates when any session has active status
  useEffect(() => {
    const hasActiveSession = sessions.some(
      (s) => s.status === 'recording' || s.status === 'transcribing' || s.status === 'processing'
    );

    if (hasActiveSession) {
      pollIntervalRef.current = setInterval(() => {
        fetchSessions();
      }, 10000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [sessions, fetchSessions]);

  function handleSessionClick(id) {
    navigate(`/session/${id}`);
  }

  function handleSync() {
    syncPendingRecordings();
  }

  async function handleQuickRecord() {
    setCreatingRecord(true);
    try {
      const session = await createSession({ context: 'working_session' });
      navigate(`/recording/${session.id}`);
    } catch (err) {
      setError(err.message || 'Failed to create session.');
      setCreatingRecord(false);
    }
  }

  // Sort sessions: active statuses first, then by date
  const activeStatuses = ['recording', 'transcribing', 'processing'];
  const sortedSessions = [...sessions].sort((a, b) => {
    const aActive = activeStatuses.includes(a.status) ? 0 : 1;
    const bActive = activeStatuses.includes(b.status) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return 0; // preserve server order for same-priority items
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-12 safe-area-inset">
      {/* Header */}
      <div className="glass rounded-xl px-4 py-3 md:px-6 md:py-4 flex items-center justify-between gap-4">
        <div>
          <h1
            className="text-xl font-bold tracking-tight text-slate-50"
            style={{ textShadow: '0 0 20px rgba(249, 115, 22, 0.3)' }}
          >
            ECHOBRIDGE
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Record conversations, get AI-powered notes.</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/guide')}
            className="text-slate-400 hover:text-orange-400 transition-colors touch-target inline-flex items-center justify-center"
            aria-label="Guide"
            title="Getting Started Guide"
          >
            <BookOpen size={20} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => navigate('/ask')}
            className="text-slate-400 hover:text-orange-400 transition-colors touch-target inline-flex items-center justify-center"
            aria-label="Ask EchoBridge"
            title="Ask EchoBridge"
          >
            <MessageSquare size={20} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="text-slate-400 hover:text-orange-400 transition-colors touch-target inline-flex items-center justify-center"
            aria-label="Settings"
          >
            <Settings size={20} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => navigate('/join')}
            className="btn-secondary inline-flex items-center gap-2 touch-target"
          >
            <Users size={16} strokeWidth={1.5} />
            Join
          </button>
          <button
            onClick={() => navigate('/new')}
            className="btn-secondary inline-flex items-center gap-2 touch-target"
          >
            <Upload size={16} strokeWidth={1.5} />
            Upload
          </button>
          <button
            onClick={handleQuickRecord}
            disabled={creatingRecord}
            className="btn-primary inline-flex items-center gap-2 touch-target disabled:opacity-50"
          >
            <Mic size={16} strokeWidth={1.5} />
            Record
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
            setSeriesFilter(null);
            setSearchQuery('');
          }}
          activeFilter={contextFilter}
        />

        {/* Series filter chips */}
        {seriesList.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <BookOpen size={14} strokeWidth={1.5} className="text-slate-400 shrink-0" />
            <button
              onClick={() => { setSeriesFilter(null); setContextFilter(null); }}
              className={`text-xs font-medium px-2.5 py-1 rounded-full transition-all duration-200 touch-target ${
                !seriesFilter
                  ? 'bg-orange-500/20 border border-orange-400/50 text-orange-300'
                  : 'bg-white/10 border border-white/15 text-slate-400 hover:bg-white/[0.14]'
              }`}
            >
              All
            </button>
            {seriesList.map((s) => (
              <div key={s.id} className="flex items-center gap-1">
                <button
                  onClick={() => { setSeriesFilter(s.id); setContextFilter(null); setSearchQuery(''); }}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full transition-all duration-200 touch-target ${
                    seriesFilter === s.id
                      ? 'bg-orange-500/20 border border-orange-400/50 text-orange-300'
                      : 'bg-white/10 border border-white/15 text-slate-400 hover:bg-white/[0.14]'
                  }`}
                >
                  {s.name}
                </button>
                <button
                  onClick={() => navigate(`/series/${s.id}`)}
                  className="text-slate-400 hover:text-orange-400 transition-colors"
                  title="View Memory"
                >
                  <BookOpen size={12} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Session list */}
      <div className="mt-8">
        {loading && (
          <p className="text-sm text-slate-400">Loading...</p>
        )}

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="glass rounded-xl p-8 md:p-12 flex flex-col items-center text-center">
            <MessageSquare size={40} strokeWidth={1.5} className="text-slate-400 mb-4" />
            <p className="text-base font-medium text-slate-300">No meetings yet</p>
            <p className="mt-1 text-sm text-slate-400 max-w-md">
              No meetings yet. Tap Record to capture your first conversation.
            </p>
            <button
              onClick={handleQuickRecord}
              disabled={creatingRecord}
              className="btn-primary inline-flex items-center gap-2 mt-6 disabled:opacity-50"
            >
              <Mic size={16} strokeWidth={1.5} />
              Record
            </button>
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="grid gap-4">
            {sortedSessions.map((session) => (
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
