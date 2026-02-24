import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Cpu, Loader2 } from 'lucide-react';
import { sendChatMessage, getConversation } from '../lib/api';
import MarkdownPreview from './MarkdownPreview';

function RoleBadge({ role, source }) {
  if (role === 'user') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
        <User size={12} strokeWidth={1.5} />
        You
      </span>
    );
  }
  if (role === 'agent') {
    const agentName = source?.startsWith('agent:') ? source.slice(6) : 'Agent';
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-400">
        <Cpu size={12} strokeWidth={1.5} />
        {agentName}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-400">
      <Bot size={12} strokeWidth={1.5} />
      EchoBridge
    </span>
  );
}

export default function ChatPanel({ sessionId, conversationId: initialConversationId, onConversationCreated }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState(initialConversationId || null);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load existing conversation
  useEffect(() => {
    if (!conversationId) return;
    async function load() {
      try {
        const convo = await getConversation(conversationId);
        if (convo?.messages) {
          setMessages(convo.messages);
        }
      } catch {
        // Fresh conversation, no messages yet
      }
    }
    load();
  }, [conversationId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);
    setError(null);

    // Optimistic user message
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      source: 'user',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const result = await sendChatMessage({
        conversationId,
        message: text,
        sessionId: sessionId || null,
      });

      // Update conversation ID if this was the first message
      if (!conversationId && result.conversation_id) {
        setConversationId(result.conversation_id);
        onConversationCreated?.(result.conversation_id);
      }

      // Replace temp message and add assistant response
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempUserMsg.id);
        return [
          ...withoutTemp,
          { ...tempUserMsg, id: `user-${Date.now()}` },
          result.message,
        ];
      });
    } catch (err) {
      setError(err.message || 'Failed to send message.');
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto glass-scrollbar px-4 py-4 space-y-4">
        {messages.length === 0 && !sending && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <Bot size={32} strokeWidth={1.5} className="text-slate-400 mb-3" />
            <p className="text-sm text-slate-400">
              {sessionId
                ? 'Ask a question about this meeting.'
                : 'Ask a question across all your meetings.'}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-1 ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <RoleBadge role={msg.role} source={msg.source} />
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-orange-500/20 border border-orange-400/20 text-slate-100'
                  : msg.role === 'agent'
                  ? 'bg-purple-500/10 border border-purple-400/20 text-slate-200'
                  : 'glass text-slate-200'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <MarkdownPreview content={msg.content} />
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex items-start gap-2">
            <div className="glass rounded-xl px-4 py-3">
              <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-orange-400" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-white/15 px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={sessionId ? 'Ask about this meeting...' : 'Ask across all meetings...'}
            className="glass-input flex-1 px-4 py-2.5 text-sm"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="btn-primary !px-3 !py-2.5 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={16} strokeWidth={1.5} />
          </button>
        </form>
      </div>
    </div>
  );
}
