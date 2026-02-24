import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Download, MessageSquare, X } from 'lucide-react';
import {
  getSession,
  getInterpretations,
  interpretSession,
  exportMarkdown,
  updateSession,
  listSeries,
  addSessionToSeries,
  getConversations,
} from '../lib/api';
import {
  contextLabel,
  formatDate,
  formatDurationShort,
} from '../lib/utils';
import MarkdownPreview from '../components/MarkdownPreview';
import InterpretationCard from '../components/InterpretationCard';
import SocketSelector from '../components/SocketSelector';
import ChatPanel from '../components/ChatPanel';

const TABS = ['Summary', 'Transcript', 'Interpretations'];

/** Dark-adapted status colors for glassmorphism theme */
function darkStatusColor(status) {
  const colors = {
    created: 'text-slate-500',
    recording: 'text-red-400',
    transcribing: 'text-amber-400',
    processing: 'text-amber-400',
    complete: 'text-green-400',
    error: 'text-red-400',
    waiting: 'text-slate-500',
    closed: 'text-slate-500',
  };
  return colors[status] || 'text-slate-500';
}

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
  const [showSeriesAdd, setShowSeriesAdd] = useState(false);
  const [allSeries, setAllSeries] = useState([]);
  const [addingSeries, setAddingSeries] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatConversationId, setChatConversationId] = useState(null);

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

  // Load existing chat conversation for this session
  useEffect(() => {
    async function loadChat() {
      try {
        const convos = await getConversations(id);
        if (Array.isArray(convos) && convos.length > 0) {
          setChatConversationId(convos[0].id);
        }
      } catch {
        // No existing conversation
      }
    }
    loadChat();
  }, [id]);

  // Poll for status updates while session is in progress
  useEffect(() => {
    if (!session) return;
    const activeStatuses = ['created', 'transcribing', 'processing'];
    if (!activeStatuses.includes(session.status)) return;

    const interval = setInterval(async () => {
      try {
        const [sess, interps] = await Promise.all([
          getSession(id),
          getInterpretations(id),
        ]);
        setSession(sess);
        setInterpretations(Array.isArray(interps) ? interps : []);
      } catch {
        // Silently ignore poll failures
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [id, session?.status]);

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
      // Check for API key error (401)
      if (err.status === 401 || (err.message && err.message.includes('401'))) {
        setInterpretError('API_KEY_MISSING');
      } else {
        setInterpretError(err.message || 'Interpretation failed.');
      }
    } finally {
      setInterpreting(false);
    }
  }

  const primaryInterpretation = interpretations.find((i) => i.is_primary);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-12 safe-area-inset">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-12 safe-area-inset">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex min-h-screen">
    <div className={`flex-1 transition-all duration-300 ${showChat ? 'mr-0 lg:mr-[400px]' : ''}`}>
    <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-12 safe-area-inset">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => navigate('/')}
          className="text-slate-400 hover:text-orange-400 transition-colors inline-flex items-center gap-2 text-sm font-medium touch-target shrink-0"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
          <span className="hidden sm:inline">Back</span>
        </button>
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          {editingTitle ? (
            <div className="flex items-center gap-2 min-w-0">
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                className="glass-input text-base px-4 py-2 min-w-0"
                autoFocus
              />
              <button
                onClick={handleSaveTitle}
                className="text-sm font-medium text-slate-300 hover:text-orange-400 transition-colors touch-target"
              >
                Save
              </button>
            </div>
          ) : (
            <h1 className="text-lg md:text-xl font-semibold text-slate-100 truncate">
              {session.title || 'Untitled Session'}
            </h1>
          )}
          <button
            onClick={() => setEditingTitle(!editingTitle)}
            className="text-slate-400 hover:text-orange-400 transition-colors touch-target inline-flex items-center justify-center shrink-0"
            aria-label="Edit title"
          >
            <Pencil size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={handleExport}
            className="text-slate-400 hover:text-orange-400 transition-colors touch-target inline-flex items-center justify-center shrink-0"
            aria-label="Download export"
          >
            <Download size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setShowChat(!showChat)}
            className={`transition-colors touch-target inline-flex items-center justify-center shrink-0 ${
              showChat ? 'text-orange-400' : 'text-slate-400 hover:text-orange-400'
            }`}
            aria-label="Toggle chat"
          >
            <MessageSquare size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <nav className="mt-8">
        <div className="glass rounded-xl p-1 inline-flex gap-1 overflow-x-auto max-w-full">
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
                className={`px-3 md:px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap touch-target ${
                  isActive
                    ? 'bg-orange-500/20 text-orange-300'
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
        {/* Summary tab */}
        {activeTab === 'Summary' && (
          <div>
            {/* Metadata */}
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
              <span className="section-label">
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
                  <span className={darkStatusColor(session.status)}>
                    {session.status}
                  </span>
                </>
              )}
            </div>

            {/* Series badge */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {session.series_id && session.series_name ? (
                <button
                  onClick={() => navigate(`/series/${session.series_id}`)}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 bg-orange-500/10 border border-orange-400/20 text-xs font-medium text-orange-300 hover:bg-orange-500/20 transition-colors"
                >
                  {session.series_name}
                </button>
              ) : (
                <>
                  {showSeriesAdd ? (
                    <div className="flex items-center gap-2">
                      <select
                        onChange={async (e) => {
                          if (!e.target.value) return;
                          setAddingSeries(true);
                          try {
                            await addSessionToSeries(e.target.value, session.id);
                            const updated = await getSession(session.id);
                            setSession(updated);
                            setShowSeriesAdd(false);
                          } catch {
                            // Silently fail
                          } finally {
                            setAddingSeries(false);
                          }
                        }}
                        disabled={addingSeries}
                        className="glass-select text-xs px-2 py-1 rounded-lg"
                      >
                        <option value="">Select series...</option>
                        {allSeries.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setShowSeriesAdd(false)}
                        className="text-xs text-slate-500 hover:text-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          const series = await listSeries();
                          setAllSeries(Array.isArray(series) ? series : []);
                        } catch {
                          setAllSeries([]);
                        }
                        setShowSeriesAdd(true);
                      }}
                      className="text-xs text-slate-500 hover:text-orange-400 transition-colors"
                    >
                      + Add to Series
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Room info */}
            {session.room_code && (
              <p className="mt-2 text-sm text-slate-400">
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
                <p className="text-sm text-slate-500">
                  No primary interpretation yet.
                </p>
              ) : (
                <p className="text-sm text-slate-500">
                  Session is {session.status}. Interpretation will be available when processing completes.
                </p>
              )}
            </div>

            {/* Tags */}
            {session.tags && session.tags.length > 0 && (
              <div className="mt-8 pt-8 border-t border-white/10 flex flex-wrap gap-2">
                {session.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-3 py-1 bg-white/5 border border-white/10 text-xs text-slate-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Export path */}
            {session.export_path && (
              <p className="mt-4 text-xs text-slate-600">
                Saved to {session.export_path}
              </p>
            )}
          </div>
        )}

        {/* Transcript tab */}
        {activeTab === 'Transcript' && (
          <div>
            {session.transcript ? (
              <div className="glass rounded-xl p-4 md:p-6 max-h-[600px] overflow-y-auto">
                <p className="font-mono text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {session.transcript}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No transcript available.
              </p>
            )}
          </div>
        )}

        {/* Interpretations tab */}
        {activeTab === 'Interpretations' && (
          <div>
            {interpretations.length === 0 && (
              <p className="text-sm text-slate-400">
                Interpretations are AI-generated notes from your transcript. Click 'New Interpretation' and choose a lens to get started.
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
                    interpretError === 'API_KEY_MISSING' ? (
                      <div className="mt-4 glass rounded-xl p-4 flex items-center gap-3">
                        <p className="text-sm text-amber-400 flex-1">AI interpretation requires an API key.</p>
                        <button
                          onClick={() => navigate('/settings')}
                          className="btn-secondary text-xs whitespace-nowrap"
                        >
                          Go to Settings
                        </button>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-red-400">{interpretError}</p>
                    )
                  )}
                  <div className="mt-4 flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={handleInterpret}
                      disabled={!selectedLens || interpreting}
                      className="btn-primary touch-target"
                    >
                      {interpreting ? 'Interpreting...' : 'Run Interpretation'}
                    </button>
                    <button
                      onClick={() => {
                        setShowLensSelector(false);
                        setSelectedLens(null);
                        setInterpretError(null);
                      }}
                      className="btn-secondary touch-target"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowLensSelector(true)}
                  className="btn-secondary touch-target"
                >
                  New Interpretation
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </div>

    {/* Chat sidebar */}
    {showChat && (
      <div className="fixed right-0 top-0 h-full w-full sm:w-[400px] glass-strong z-50 flex flex-col border-l border-white/10">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-medium text-slate-200">Chat</h2>
          <button
            onClick={() => setShowChat(false)}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <ChatPanel
            sessionId={id}
            conversationId={chatConversationId}
            onConversationCreated={(newId) => setChatConversationId(newId)}
          />
        </div>
      </div>
    )}
    </div>
  );
}
