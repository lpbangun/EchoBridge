import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Folder, Plus, ChevronRight } from 'lucide-react';
import { listSeries, createSeries } from '../lib/api';
import { formatDate } from '../lib/utils';

export default function SeriesListPage() {
  const navigate = useNavigate();
  const [seriesList, setSeriesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setLoading(true);
    listSeries()
      .then((data) => setSeriesList(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || 'Failed to load series.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const series = await createSeries({ name: newName.trim() });
      setSeriesList((prev) => [series, ...prev]);
      setNewName('');
      setShowCreate(false);
    } catch (err) {
      setError(err.message || 'Failed to create series.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-white">Series</h1>
          <p className="text-sm text-zinc-400 mt-1">Group related sessions to build meeting memory.</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="btn-primary inline-flex items-center gap-2 text-sm"
        >
          <Plus size={14} strokeWidth={2} />
          New Series
        </button>
      </div>

      {/* Inline create form */}
      {showCreate && (
        <div className="card-lg p-4 mt-6 flex items-center gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Series name..."
            className="eb-input flex-1 px-3 py-2 text-sm"
            autoFocus
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
          >
            {creating ? '...' : 'Create'}
          </button>
          <button
            onClick={() => { setShowCreate(false); setNewName(''); }}
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {/* Series list */}
      <div className="mt-6">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="h-4 bg-zinc-800 rounded w-1/3" />
                <div className="h-3 bg-zinc-800 rounded w-1/2 mt-2" />
              </div>
            ))}
          </div>
        )}

        {!loading && seriesList.length === 0 && !showCreate && (
          <div className="card-lg p-10 flex flex-col items-center text-center">
            <Folder size={32} strokeWidth={1.5} className="text-zinc-500 mb-3" />
            <p className="text-sm font-medium text-zinc-300">No series yet</p>
            <p className="text-xs text-zinc-500 mt-1">Create a series to group related sessions.</p>
          </div>
        )}

        {!loading && seriesList.length > 0 && (
          <div className="grid gap-3">
            {seriesList.map((series) => (
              <button
                key={series.id}
                onClick={() => navigate(`/series/${series.id}`)}
                className="card p-5 text-left hover:border-border-hover transition-colors w-full flex items-center justify-between group"
              >
                <div className="min-w-0">
                  <h3 className="font-display text-base font-bold text-white truncate">{series.name}</h3>
                  {series.description && (
                    <p className="text-sm text-zinc-400 mt-1 line-clamp-1">{series.description}</p>
                  )}
                  <p className="font-mono text-[11px] text-zinc-600 mt-2">
                    {series.session_count} session{series.session_count !== 1 ? 's' : ''}
                    {series.updated_at && <span> &middot; Updated {formatDate(series.updated_at)}</span>}
                  </p>
                </div>
                <ChevronRight size={16} strokeWidth={1.5} className="text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0 ml-4" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
