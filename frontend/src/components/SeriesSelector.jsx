import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { listSeries, createSeries } from '../lib/api';

/**
 * Dropdown for selecting or creating a series.
 * Used in NewSession page and SessionView for adding to series.
 */
export default function SeriesSelector({ value, onChange }) {
  const [seriesList, setSeriesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listSeries()
      .then((data) => setSeriesList(Array.isArray(data) ? data : []))
      .catch(() => setSeriesList([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const series = await createSeries({ name: newName.trim() });
      setSeriesList((prev) => [series, ...prev]);
      onChange(series.id);
      setNewName('');
      setShowCreate(false);
    } catch {
      // Silently fail
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading series...</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value || null)}
            className="eb-select w-full text-base px-4 py-3 rounded-xl pr-10"
          >
            <option value="">None (standalone session)</option>
            {seriesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.session_count} sessions)
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <svg className="h-5 w-5 text-zinc-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="text-zinc-400 hover:text-accent transition-colors touch-target inline-flex items-center justify-center"
          aria-label={showCreate ? 'Cancel new series' : 'New series'}
        >
          {showCreate ? <X size={20} strokeWidth={1.5} /> : <Plus size={20} strokeWidth={1.5} />}
        </button>
      </div>

      {showCreate && (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="New series name..."
            className="eb-input flex-1 text-sm px-3 py-2 rounded-lg"
            autoFocus
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            className="btn-primary text-sm px-3 py-2 disabled:opacity-50"
          >
            {creating ? '...' : 'Create'}
          </button>
        </div>
      )}
    </div>
  );
}
