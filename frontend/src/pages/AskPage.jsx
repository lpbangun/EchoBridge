import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, MessageSquare } from 'lucide-react';
import { getConversations, deleteConversation } from '../lib/api';
import ChatPanel from '../components/ChatPanel';

export default function AskPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const convos = await getConversations();
        // Only show global (non-session) conversations
        const global = (Array.isArray(convos) ? convos : []).filter(
          (c) => !c.session_id
        );
        setConversations(global);
        if (global.length > 0 && !activeConversationId) {
          setActiveConversationId(global[0].id);
        }
      } catch {
        setConversations([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleNewConversation() {
    setActiveConversationId(null);
  }

  async function handleDelete(id) {
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
    } catch {
      // Silently fail
    }
  }

  function handleConversationCreated(newId) {
    setActiveConversationId(newId);
    // Add to conversation list
    setConversations((prev) => [
      { id: newId, title: 'Ask EchoBridge', created_at: new Date().toISOString() },
      ...prev,
    ]);
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar — conversation list */}
      <div
        className={`${
          showSidebar ? 'w-64 sm:w-72' : 'w-0'
        } transition-all duration-300 overflow-hidden border-r border-white/10 flex flex-col shrink-0`}
      >
        <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-orange-400 transition-colors inline-flex items-center gap-2 text-sm font-medium"
          >
            <ArrowLeft size={16} strokeWidth={1.5} />
            Back
          </button>
          <button
            onClick={handleNewConversation}
            className="text-slate-400 hover:text-orange-400 transition-colors"
            title="New conversation"
          >
            <Plus size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto glass-scrollbar">
          {loading && (
            <p className="text-xs text-slate-500 px-4 py-3">Loading...</p>
          )}

          {!loading && conversations.length === 0 && (
            <p className="text-xs text-slate-500 px-4 py-3">
              No conversations yet. Ask a question to get started.
            </p>
          )}

          {conversations.map((convo) => (
            <div
              key={convo.id}
              className={`group flex items-center gap-2 px-4 py-3 cursor-pointer transition-colors border-b border-white/5 ${
                activeConversationId === convo.id
                  ? 'bg-orange-500/10 border-l-2 border-l-orange-400'
                  : 'hover:bg-white/5'
              }`}
            >
              <button
                onClick={() => setActiveConversationId(convo.id)}
                className="flex-1 text-left min-w-0"
              >
                <p className="text-sm text-slate-200 truncate">
                  {convo.title || 'Untitled'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(convo.created_at).toLocaleDateString()}
                </p>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(convo.id);
                }}
                className="text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Delete conversation"
              >
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="text-slate-400 hover:text-slate-200 transition-colors lg:hidden"
            >
              <MessageSquare size={18} strokeWidth={1.5} />
            </button>
            <h1 className="text-base font-medium text-slate-100">
              Ask EchoBridge
            </h1>
          </div>
          <p className="text-xs text-slate-500">
            Cross-meeting AI search
          </p>
        </div>

        <div className="flex-1 min-h-0">
          <ChatPanel
            key={activeConversationId || 'new'}
            sessionId={null}
            conversationId={activeConversationId}
            onConversationCreated={handleConversationCreated}
          />
        </div>
      </div>
    </div>
  );
}
