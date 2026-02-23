import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Download } from 'lucide-react';
import {
  getSession,
  getInterpretations,
  interpretSession,
  exportMarkdown,
  updateSession,
} from '../lib/api';
import {
  contextLabel,
  formatDate,
  formatDurationShort,
  statusColor,
} from '../lib/utils';
import MarkdownPreview from '../components/MarkdownPreview';
import InterpretationCard from '../components/InterpretationCard';
import SocketSelector from '../components/SocketSelector';

const TABS = ['Summary', 'Transcript', 'Interpretations'];

export default function SessionView() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [interpretations, setInterpretations] = useState([]);
  const [activeTab, setActiveTab] = useState('Summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [showLensSelector, setShowLensSelector] = useState(false);
  const [selectedLens, setSelectedLens] = useState(null);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretError, setInterpretError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [sess, interps] = await Promise.all([
          getSession(id),
          getInterpretations(id),
        ]);
        setSession(sess);
        setInterpretations(Array.isArray(interps) ? interps : []);
        setTitleDraft(sess.title || '');
      } catch (err) {
        setError(err.message || 'Failed to load session.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSaveTitle() {
    if (!titleDraft.trim()) return;
    try {
      await updateSession(id, { title: titleDraft.trim() });
      setSession((prev) => ({ ...prev, title: titleDraft.trim() }));
      setEditingTitle(false);
    } catch {
      // Silently fail title update
    }
  }

  async function handleExport() {
    try {
      const md = await exportMarkdown(id);
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${session?.title || 'session'}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Export failed.');
    }
  }

  async function handleInterpret() {
    if (!selectedLens) return;
    setInterpreting(true);
    setInterpretError(null);
    try {
      const result = await interpretSession(id, {
        lens_type: selectedLens.lens_type,
        lens_id: selectedLens.lens_id,
      });
      setInterpretations((prev) => [...prev, result]);
      setShowLensSelector(false);
      setSelectedLens(null);
    } catch (err) {
      setInterpretError(err.message || 'Interpretation failed.');
    } finally {
      setInterpreting(false);
    }
  }

  const primaryInterpretation = interpretations.find((i) => i.is_primary);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-sm text-neutral-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="text-neutral-500 hover:text-neutral-700 transition-colors inline-flex items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
          Back
        </button>
        <div className="flex items-center gap-4">
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                className="text-base px-4 py-2 border border-neutral-200 bg-white focus:border-neutral-900 focus:outline-none transition-colors"
                autoFocus
              />
              <button
                onClick={handleSaveTitle}
                className="text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors"
              >
                Save
              </button>
            </div>
          ) : (
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">
              {session.title || 'Untitled Session'}
            </h1>
          )}
          <button
            onClick={() => setEditingTitle(!editingTitle)}
            className="text-neutral-500 hover:text-neutral-700 transition-colors"
            aria-label="Edit title"
          >
            <Pencil size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={handleExport}
            className="text-neutral-500 hover:text-neutral-700 transition-colors"
            aria-label="Download export"
          >
            <Download size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <nav className="mt-8 flex border-b border-neutral-200">
        {TABS.map((tab) => {
          const label =
            tab === 'Interpretations'
              ? `Interpretations (${interpretations.length})`
              : tab;
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-neutral-900 border-b-2 border-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      <div className="mt-8">
        {/* Summary tab */}
        {activeTab === 'Summary' && (
          <div>
            {/* Metadata */}
            <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
              <span className="text-xs font-medium tracking-widest uppercase">
                {contextLabel(session.context)}
              </span>
              <span>&middot;</span>
              <span>{formatDate(session.created_at)}</span>
              {session.duration_seconds != null && (
                <>
                  <span>&middot;</span>
                  <span>{formatDurationShort(session.duration_seconds)}</span>
                </>
              )}
              {session.status && (
                <>
                  <span>&middot;</span>
                  <span className={statusColor(session.status)}>
                    {session.status}
                  </span>
                </>
              )}
            </div>

            {/* Room info */}
            {session.room_code && (
              <p className="mt-2 text-sm text-neutral-500">
                Room {session.room_code}
                {session.participant_count != null && (
                  <span> &middot; {session.participant_count} participants</span>
                )}
              </p>
            )}

            {/* Primary interpretation content */}
            <div className="mt-8">
              {primaryInterpretation ? (
                <MarkdownPreview content={primaryInterpretation.output_markdown} />
              ) : session.status === 'complete' ? (
                <p className="text-sm text-neutral-400">
                  No primary interpretation yet.
                </p>
              ) : (
                <p className="text-sm text-neutral-400">
                  Session is {session.status}. Interpretation will be available when processing completes.
                </p>
              )}
            </div>

            {/* Tags */}
            {session.tags && session.tags.length > 0 && (
              <div className="mt-8 pt-8 border-t border-neutral-200 flex flex-wrap gap-2">
                {session.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-block text-xs font-medium tracking-wide px-2.5 py-1 border border-neutral-200 text-neutral-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Export path */}
            {session.export_path && (
              <p className="mt-4 text-xs text-neutral-400">
                Saved to {session.export_path}
              </p>
            )}
          </div>
        )}

        {/* Transcript tab */}
        {activeTab === 'Transcript' && (
          <div className="max-h-[600px] overflow-y-auto">
            {session.transcript ? (
              <p className="font-mono text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">
                {session.transcript}
              </p>
            ) : (
              <p className="text-sm text-neutral-400">
                No transcript available.
              </p>
            )}
          </div>
        )}

        {/* Interpretations tab */}
        {activeTab === 'Interpretations' && (
          <div>
            {interpretations.length === 0 && (
              <p className="text-sm text-neutral-400">
                No interpretations yet.
              </p>
            )}

            <div className="grid gap-4">
              {interpretations.map((interp) => (
                <InterpretationCard key={interp.id} interpretation={interp} />
              ))}
            </div>

            {/* New interpretation */}
            <div className="mt-8">
              {showLensSelector ? (
                <div>
                  <SocketSelector
                    value={selectedLens}
                    onSelect={setSelectedLens}
                  />
                  {interpretError && (
                    <p className="mt-4 text-sm text-red-600">{interpretError}</p>
                  )}
                  <div className="mt-4 flex gap-4">
                    <button
                      onClick={handleInterpret}
                      disabled={!selectedLens || interpreting}
                      className="bg-neutral-900 text-white text-sm font-medium px-5 py-2.5 hover:bg-neutral-800 transition-colors disabled:opacity-50"
                    >
                      {interpreting ? 'Interpreting...' : 'Run Interpretation'}
                    </button>
                    <button
                      onClick={() => {
                        setShowLensSelector(false);
                        setSelectedLens(null);
                        setInterpretError(null);
                      }}
                      className="bg-white text-neutral-700 text-sm font-medium px-5 py-2.5 border border-neutral-200 hover:border-neutral-400 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowLensSelector(true)}
                  className="bg-white text-neutral-700 text-sm font-medium px-5 py-2.5 border border-neutral-200 hover:border-neutral-400 transition-colors"
                >
                  New Interpretation
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
