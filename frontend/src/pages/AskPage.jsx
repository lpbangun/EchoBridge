import { useState, useEffect } from 'react';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import { getConversations, deleteConversation } from '../lib/api';
import ChatPanel from '../components/ChatPanel';

export default function AskPage() {
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
        } transition-all duration-300 overflow-hidden bg-surface-dark border-r border-border flex flex-col shrink-0`}
      >
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <span className="font-display text-sm font-bold text-white">Conversations</span>
          <button
            onClick={handleNewConversation}
            className="text-zinc-400 hover:text-accent transition-colors"
            title="New conversation"
          >
            <Plus size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto eb-scrollbar">
          {loading && (
            <p className="text-xs text-zinc-400 px-4 py-3">Loading...</p>
          )}

          {!loading && conversations.length === 0 && (
            <p className="text-xs text-zinc-400 px-4 py-3">
              No conversations yet. Ask a question to get started.
            </p>
          )}

          {conversations.map((convo) => (
            <div
              key={convo.id}
              className={`group flex items-center gap-2 px-4 py-3 cursor-pointer transition-colors border-b border-border ${
                activeConversationId === convo.id
                  ? 'bg-accent-muted border-l-2 border-l-accent'
                  : 'hover:bg-zinc-800/50'
              }`}
            >
              <button
                onClick={() => setActiveConversationId(convo.id)}
                className="flex-1 text-left min-w-0"
              >
                <p className="text-sm text-zinc-200 truncate">
                  {convo.title || 'Untitled'}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {new Date(convo.created_at).toLocaleDateString()}
                </p>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(convo.id);
                }}
                className="text-zinc-400 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
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
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="text-zinc-400 hover:text-zinc-200 transition-colors lg:hidden"
            >
              <MessageSquare size={18} strokeWidth={1.5} />
            </button>
            <h1 className="font-display text-base font-bold text-white">
              Ask EchoBridge
            </h1>
          </div>
          <p className="text-xs text-zinc-400">
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
