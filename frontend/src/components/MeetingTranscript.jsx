import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';

const AGENT_COLORS = ['#C4F82A', '#F59E0B', '#38BDF8', '#A78BFA'];

export default function MeetingTranscript({ messages = [], agents = [], thinkingAgent = null }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Build a color map for agent names
  const colorMap = {};
  agents.forEach((a, i) => {
    const name = typeof a === 'string' ? a : a.name;
    colorMap[name] = AGENT_COLORS[i % AGENT_COLORS.length];
  });

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
        Waiting for meeting to begin...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto eb-scrollbar space-y-1 py-4">
      {messages.map((msg) => {
        if (msg.message_type === 'status') {
          return (
            <div key={msg.id || msg.sequence_number} className="text-center py-2">
              <span className="text-xs text-zinc-500 font-medium">
                {msg.content}
              </span>
            </div>
          );
        }

        if (msg.message_type === 'directive') {
          return (
            <div
              key={msg.id || msg.sequence_number}
              className="mx-4 px-4 py-3 border-l-2 border-amber-500 bg-amber-500/5"
            >
              <span className="text-[10px] uppercase tracking-wider text-amber-500 font-medium">
                Directive from {msg.sender_name}
              </span>
              <p className="text-sm text-amber-200 mt-1">{msg.content}</p>
            </div>
          );
        }

        if (msg.message_type === 'artifact') {
          const agentColor = colorMap[msg.sender_name] || '#71717A';
          return (
            <div
              key={msg.id || msg.sequence_number}
              className="mx-4 px-4 py-3 border-l-2 bg-zinc-800/40"
              style={{ borderLeftColor: agentColor }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-2 h-2" style={{ backgroundColor: agentColor }} />
                <span className="text-xs font-semibold" style={{ color: agentColor }}>
                  {msg.sender_name}
                </span>
                <span className="text-[10px] text-zinc-600 ml-1">artifact</span>
              </div>
              <div className="prose prose-invert prose-sm max-w-none text-zinc-200">
                <Markdown>{msg.content}</Markdown>
              </div>
            </div>
          );
        }

        const isHuman = msg.sender_type === 'human';
        const agentColor = colorMap[msg.sender_name] || '#71717A';

        return (
          <div key={msg.id || msg.sequence_number} className="px-4 py-2 hover:bg-zinc-800/30 transition-colors">
            <div className="flex items-baseline gap-2">
              {/* Color dot + name */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div
                  className="w-2 h-2 flex-shrink-0"
                  style={{ backgroundColor: isHuman ? '#C4F82A' : agentColor }}
                />
                <span
                  className="text-xs font-semibold"
                  style={{ color: isHuman ? '#C4F82A' : agentColor }}
                >
                  {msg.sender_name}
                </span>
              </div>

              {/* Timestamp */}
              <span className="text-[10px] text-zinc-600">
                #{msg.sequence_number}
              </span>
            </div>

            {/* Message content */}
            <p className={`mt-1 text-sm leading-relaxed ${
              isHuman ? 'text-lime-100' : 'text-zinc-200'
            }`}>
              {msg.content}
            </p>
          </div>
        );
      })}
      {thinkingAgent && (
        <div className="px-4 py-2 flex items-center gap-2">
          <div
            className="w-2 h-2 animate-pulse"
            style={{ backgroundColor: colorMap[thinkingAgent] || '#71717A' }}
          />
          <span
            className="text-xs animate-pulse"
            style={{ color: colorMap[thinkingAgent] || '#71717A' }}
          >
            {thinkingAgent} is thinking...
          </span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
