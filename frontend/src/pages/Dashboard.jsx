import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, CloudOff, RefreshCw, BookOpen, MessageSquare, Mic } from 'lucide-react';
import { listSessions, searchSessions, getSettings, listSeries, createSession } from '../lib/api';
import { getPendingCount } from '../lib/offlineStorage';
import { syncPendingRecordings, onSyncStatusChange } from '../lib/syncManager';
import { useSearch } from '../components/AppLayout';
import SessionCard from '../components/SessionCard';
import { contextLabel } from '../lib/utils';

const CONTEXT_FILTERS = [
  { id: null, label: 'All' },
  { id: 'class_lecture', label: null },
  { id: 'startup_meeting', label: null },
  { id: 'research_discussion', label: null },
  { id: 'working_session', label: null },
  { id: 'talk_seminar', label: null },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { query: searchQuery } = useSearch();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [contextFilter, setContextFilter] = useState(null);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [seriesList, setSeriesList] = useState([]);
  const [seriesFilter, setSeriesFilter] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const pollIntervalRef = useRef(null);

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
      if (searchQuery?.trim()) {
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

  // Metrics computation
  const activeStatuses = ['recording', 'transcribing', 'processing'];
  const activeCount = sessions.filter((s) => activeStatuses.includes(s.status)).length;
  const completeCount = sessions.filter((s) => s.status === 'complete').length;
  const agentCount = sessions.filter((s) => s.room_code).length;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisWeekCount = sessions.filter((s) => new Date(s.created_at) >= weekAgo).length;

  const sortedSessions = [...sessions].sort((a, b) => {
    const aActive = activeStatuses.includes(a.status) ? 0 : 1;
    const bActive = activeStatuses.includes(b.status) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return 0;
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'ACTIVE', value: activeCount, sub: 'recording now' },
          { label: 'COMPLETE', value: completeCount, sub: 'total sessions' },
          { label: 'ROOMS', value: agentCount, sub: 'with room code' },
          { label: 'THIS WEEK', value: thisWeekCount, sub: 'last 7 days' },
        ].map((m) => (
          <div key={m.label} className="card-lg p-5">
            <span className="section-label">{m.label}</span>
            <p className="font-display text-[28px] font-bold text-white mt-1">{m.value}</p>
            <p className="text-xs text-zinc-500 font-sans mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Pending offline recordings banner */}
      {pendingCount > 0 && (
        <div className="card p-4 mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
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
        <div className="card p-4 mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
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

      {/* Section header + filters */}
      <div className="mt-8">
        <span className="section-label">Recent Sessions</span>

        {/* Context filter chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {CONTEXT_FILTERS.map((filter) => {
            const isActive =
              filter.id === contextFilter ||
              (filter.id === null && (contextFilter === null || contextFilter === undefined));
            const label = filter.label || contextLabel(filter.id);
            return (
              <button
                key={filter.id || 'all'}
                onClick={() => {
                  setContextFilter(filter.id);
                  setSeriesFilter(null);
                }}
                className={isActive ? 'chip-active' : 'chip-inactive'}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Series filter chips */}
        {seriesList.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <BookOpen size={14} strokeWidth={1.5} className="text-zinc-500 shrink-0" />
            <button
              onClick={() => { setSeriesFilter(null); setContextFilter(null); }}
              className={!seriesFilter ? 'chip-active' : 'chip-inactive'}
            >
              All
            </button>
            {seriesList.map((s) => (
              <div key={s.id} className="flex items-center gap-1">
                <button
                  onClick={() => { setSeriesFilter(s.id); setContextFilter(null); }}
                  className={seriesFilter === s.id ? 'chip-active' : 'chip-inactive'}
                >
                  {s.name}
                </button>
                <button
                  onClick={() => navigate(`/series/${s.id}`)}
                  className="text-zinc-500 hover:text-accent transition-colors"
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

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="card-lg p-10 flex flex-col items-center text-center">
            <MessageSquare size={32} strokeWidth={1.5} className="text-zinc-500 mb-3" />
            <p className="text-sm font-medium text-zinc-300">No meetings yet</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-md">
              Click Record in the top bar to capture your first conversation.
            </p>
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="grid gap-3">
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
