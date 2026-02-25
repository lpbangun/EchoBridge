import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, Square, Send, AlertTriangle, Loader2 } from 'lucide-react';
import {
  getAgentMeeting,
  startAgentMeeting,
  stopAgentMeeting,
  pauseAgentMeeting,
  resumeAgentMeeting,
  sendDirective,
  sendMeetingMessage,
  getSettings,
} from '../lib/api';
import MeetingTranscript from '../components/MeetingTranscript';

const AGENT_COLORS = ['#C4F82A', '#F59E0B', '#38BDF8', '#A78BFA'];

export default function AgentMeetingView() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [hostName, setHostName] = useState('Host');
  const [inputText, setInputText] = useState('');
  const [inputMode, setInputMode] = useState('message'); // 'message' | 'directive'
  const [actionLoading, setActionLoading] = useState(false);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  // Load meeting info
  useEffect(() => {
    getAgentMeeting(code)
      .then((m) => {
        setMeeting(m);
        setStatus(m.status);
      })
      .catch((err) => setError(err.message || 'Failed to load meeting'));

    getSettings()
      .then((s) => { if (s.user_display_name) setHostName(s.user_display_name); })
      .catch(() => {});
  }, [code]);

  // WebSocket connection
  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/stream/meeting/${code}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'identify',
        name: hostName,
        participant_type: 'human',
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'meeting_message') {
          setMessages((prev) => [...prev, data]);
        } else if (data.type === 'meeting_ended') {
          setStatus('closed');
          // Navigate to session view after a brief delay
          setTimeout(() => {
            navigate(`/session/${data.session_id}`);
          }, 2000);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      // Attempt reconnect after 3s if meeting is still active
      reconnectRef.current = setTimeout(() => {
        if (status === 'active' || status === 'paused') {
          connectWs();
        }
      }, 3000);
    };

    wsRef.current = ws;
  }, [code, hostName, status, navigate]);

  useEffect(() => {
    if (meeting) {
      connectWs();
    }
    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [meeting, connectWs]);

  async function handleStart() {
    setActionLoading(true);
    setError(null);
    try {
      await startAgentMeeting(code);
      setStatus('active');
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePause() {
    setActionLoading(true);
    try {
      await pauseAgentMeeting(code);
      setStatus('paused');
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResume() {
    setActionLoading(true);
    try {
      await resumeAgentMeeting(code);
      setStatus('active');
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStop() {
    setActionLoading(true);
    try {
      await stopAgentMeeting(code);
      setStatus('processing');
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSend() {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');

    try {
      if (inputMode === 'directive') {
        await sendDirective(code, text, hostName);
      } else {
        await sendMeetingMessage(code, text, hostName);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (error && !meeting) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="card-lg p-8 text-center">
          <AlertTriangle size={24} className="text-red-400 mx-auto" />
          <p className="mt-4 text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="text-accent animate-spin" />
      </div>
    );
  }

  const isRunning = status === 'active' || status === 'paused';
  const agents = meeting.agents || [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-lg font-bold text-white">
                {meeting.topic}
              </h1>
              <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 ${
                status === 'active' ? 'bg-accent/20 text-accent' :
                status === 'paused' ? 'bg-amber-500/20 text-amber-400' :
                status === 'waiting' ? 'bg-zinc-700 text-zinc-400' :
                status === 'processing' ? 'bg-blue-500/20 text-blue-400' :
                'bg-zinc-700 text-zinc-400'
              }`}>
                {status}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-zinc-500">Code: {code}</span>
              <span className="text-xs text-zinc-500">{messages.length} messages</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {status === 'waiting' && (
              <button
                onClick={handleStart}
                disabled={actionLoading}
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
              >
                <Play size={14} />
                Start
              </button>
            )}
            {status === 'active' && (
              <>
                <button
                  onClick={handlePause}
                  disabled={actionLoading}
                  className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  <Pause size={14} />
                  Pause
                </button>
                <button
                  onClick={handleStop}
                  disabled={actionLoading}
                  className="flex items-center gap-2 text-sm px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors font-medium disabled:opacity-50"
                >
                  <Square size={14} />
                  Stop
                </button>
              </>
            )}
            {status === 'paused' && (
              <>
                <button
                  onClick={handleResume}
                  disabled={actionLoading}
                  className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  <Play size={14} />
                  Resume
                </button>
                <button
                  onClick={handleStop}
                  disabled={actionLoading}
                  className="flex items-center gap-2 text-sm px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors font-medium disabled:opacity-50"
                >
                  <Square size={14} />
                  Stop
                </button>
              </>
            )}
          </div>
        </div>

        {/* Agent list */}
        <div className="flex items-center gap-4 mt-3">
          {agents.map((agent, i) => {
            const name = typeof agent === 'string' ? agent : agent.name;
            const color = AGENT_COLORS[i % AGENT_COLORS.length];
            return (
              <div key={i} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-zinc-400">{name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-6 py-2 bg-red-500/10 border-b border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Transcript */}
      <MeetingTranscript messages={messages} agents={agents} />

      {/* Input bar */}
      {isRunning && (
        <div className="px-4 py-3 border-t border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <button
              onClick={() => setInputMode(inputMode === 'message' ? 'directive' : 'message')}
              className={`px-3 py-2 text-xs font-medium transition-colors flex-shrink-0 ${
                inputMode === 'directive'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-zinc-800 text-zinc-400 border border-border hover:border-border-hover'
              }`}
            >
              {inputMode === 'directive' ? 'Directive' : 'Message'}
            </button>

            {/* Text input */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                inputMode === 'directive'
                  ? 'Send a directive to steer the conversation...'
                  : 'Join the conversation as a participant...'
              }
              className="eb-input flex-1 text-sm px-3 py-2"
            />

            {/* Send */}
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="p-2 text-accent hover:text-accent/80 transition-colors disabled:text-zinc-600 disabled:cursor-not-allowed"
            >
              <Send size={16} />
            </button>
          </div>
          {inputMode === 'directive' && (
            <p className="text-[10px] text-amber-500/60 mt-1 ml-1">
              Directives steer the conversation from above — agents see them as instructions, not dialogue.
            </p>
          )}
        </div>
      )}

      {/* Closed status */}
      {status === 'closed' && (
        <div className="px-6 py-4 border-t border-border text-center">
          <p className="text-sm text-zinc-400">
            Meeting ended. Redirecting to session view...
          </p>
        </div>
      )}
      {status === 'processing' && (
        <div className="px-6 py-4 border-t border-border text-center flex items-center justify-center gap-2">
          <Loader2 size={14} className="text-accent animate-spin" />
          <p className="text-sm text-zinc-400">
            Processing transcript and generating notes...
          </p>
        </div>
      )}
    </div>
  );
}
