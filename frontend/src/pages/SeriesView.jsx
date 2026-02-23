import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, RefreshCw } from 'lucide-react';
import {
  getSeries,
  updateSeries,
  listSeriesSessions,
  refreshSeriesMemory,
} from '../lib/api';
import { formatDate } from '../lib/utils';
import MarkdownPreview from '../components/MarkdownPreview';
import SessionCard from '../components/SessionCard';

const TABS = ['Memory', 'Sessions'];

export default function SeriesView() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [series, setSeries] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activeTab, setActiveTab] = useState('Memory');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [seriesData, sessionsData] = await Promise.all([
          getSeries(id),
          listSeriesSessions(id),
        ]);
        setSeries(seriesData);
        setSessions(Array.isArray(sessionsData) ? sessionsData : []);
        setNameDraft(seriesData.name);
        setDescDraft(seriesData.description || '');
      } catch (err) {
        setError(err.message || 'Failed to load series.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSaveName() {
    if (!nameDraft.trim()) return;
    try {
      const updated = await updateSeries(id, { name: nameDraft.trim() });
      setSeries(updated);
      setEditingName(false);
    } catch {
      // Silently fail
    }
  }

  async function handleSaveDesc() {
    try {
      const updated = await updateSeries(id, { description: descDraft.trim() });
      setSeries(updated);
      setEditingDesc(false);
    } catch {
      // Silently fail
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const result = await refreshSeriesMemory(id);
      setSeries((prev) => ({
        ...prev,
        memory_document: result.memory_document,
        updated_at: result.updated_at,
      }));
    } catch (err) {
      setError(err.message || 'Failed to refresh memory.');
    } finally {
      setRefreshing(false);
    }
  }

  function handleSessionClick(sessionId) {
    navigate(`/session/${sessionId}`);
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-12 safe-area-inset">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (error && !series) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-12 safe-area-inset">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!series) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-12 safe-area-inset">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => navigate('/')}
          className="text-slate-400 hover:text-indigo-400 transition-colors inline-flex items-center gap-2 text-sm font-medium touch-target shrink-0"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
          <span className="hidden sm:inline">Back</span>
        </button>
        <div className="flex items-center gap-2 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2 min-w-0">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                className="glass-input text-base px-4 py-2 min-w-0"
                autoFocus
              />
              <button
                onClick={handleSaveName}
                className="text-sm font-medium text-slate-300 hover:text-indigo-400 transition-colors touch-target"
              >
                Save
              </button>
            </div>
          ) : (
            <h1 className="text-lg md:text-xl font-semibold text-slate-100 truncate">
              {series.name}
            </h1>
          )}
          <button
            onClick={() => setEditingName(!editingName)}
            className="text-slate-400 hover:text-indigo-400 transition-colors touch-target inline-flex items-center justify-center shrink-0"
            aria-label="Edit name"
          >
            <Pencil size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="mt-4">
        {editingDesc ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveDesc()}
              placeholder="Series description..."
              className="glass-input flex-1 text-sm px-3 py-2"
              autoFocus
            />
            <button
              onClick={handleSaveDesc}
              className="text-sm font-medium text-slate-300 hover:text-indigo-400 transition-colors touch-target"
            >
              Save
            </button>
            <button
              onClick={() => setEditingDesc(false)}
              className="text-sm text-slate-500 hover:text-slate-300 transition-colors touch-target"
            >
              Cancel
            </button>
          </div>
        ) : (
          <p
            className="text-sm text-slate-400 cursor-pointer hover:text-slate-300 transition-colors"
            onClick={() => setEditingDesc(true)}
          >
            {series.description || 'Add a description...'}
          </p>
        )}
      </div>

      {/* Metadata */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{series.session_count} session{series.session_count !== 1 ? 's' : ''}</span>
        <span>&middot;</span>
        <span>Updated {formatDate(series.updated_at)}</span>
      </div>

      {/* Tabs */}
      <nav className="mt-8">
        <div className="glass rounded-xl p-1 inline-flex gap-1">
          {TABS.map((tab) => {
            const label =
              tab === 'Sessions'
                ? `Sessions (${sessions.length})`
                : tab;
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 md:px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap touch-target ${
                  isActive
                    ? 'bg-indigo-500/20 text-indigo-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Tab content */}
      <div className="mt-8">
        {activeTab === 'Memory' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="section-label">Meeting Memory</span>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="btn-secondary text-xs inline-flex items-center gap-1.5"
              >
                <RefreshCw size={14} strokeWidth={1.5} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Refreshing...' : 'Refresh Memory'}
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-400 mb-4">{error}</p>
            )}

            {series.memory_document ? (
              <div className="glass rounded-xl p-4 md:p-6">
                <MarkdownPreview content={series.memory_document} />
              </div>
            ) : (
              <div className="glass rounded-xl p-8 text-center">
                <p className="text-sm text-slate-500">
                  No memory document yet. Memory builds automatically when you interpret sessions in this series.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'Sessions' && (
          <div>
            {sessions.length === 0 ? (
              <div className="glass rounded-xl p-8 text-center">
                <p className="text-sm text-slate-500">
                  No sessions in this series yet. Create a new session and assign it to this series.
                </p>
              </div>
            ) : (
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
        )}
      </div>
    </div>
  );
}
