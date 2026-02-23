import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Users, Mic, Square, Copy } from 'lucide-react';
import { getRoom, startRoom, stopRoom } from '../lib/api';
import { statusColor } from '../lib/utils';
import { createWebSocket } from '../lib/websocket';
import LiveTranscript from '../components/LiveTranscript';
import ParticipantList from '../components/ParticipantList';

const POLL_INTERVAL = 5000;

export default function RoomView() {
  const navigate = useNavigate();
  const { code } = useParams();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [copied, setCopied] = useState(false);
  const wsRef = useRef(null);
  const pollRef = useRef(null);

  // Fetch room info on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getRoom(code);
        setRoom(data);
        setParticipants(data.participants || []);
      } catch (err) {
        setError(err.message || 'Failed to load room.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [code]);

  // Poll room status to detect external changes (e.g. recording started by another client)
  useEffect(() => {
    if (!room) return;

    pollRef.current = setInterval(async () => {
      try {
        const data = await getRoom(code);
        setRoom(data);
        setParticipants(data.participants || []);
      } catch {
        // Silently ignore poll failures
      }
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [code, room?.status]);

  // Connect WebSocket when room is recording
  useEffect(() => {
    if (!room || room.status !== 'recording') return;

    const wsUrl = `ws://localhost:8000/api/stream/room/${code}`;
    const ws = createWebSocket(wsUrl, {
      onOpen: () => {
        ws.send({
          type: 'identify',
          name: room.host_name || 'Viewer',
          participant_type: 'human',
        });
      },
      onMessage: (data) => {
        if (data.type === 'transcript_chunk') {
          setChunks((prev) => [
            ...prev,
            { text: data.text, is_final: data.is_final },
          ]);
        }
        if (data.type === 'participant_joined') {
          setParticipants((prev) => {
            // Avoid duplicates
            const exists = prev.some((p) => p.name === data.name);
            if (exists) return prev;
            return [
              ...prev,
              { name: data.name, participant_type: data.participant_type },
            ];
          });
        }
      },
      onClose: () => {},
      onError: () => {},
    });

    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [code, room?.status, room?.host_name]);

  // Navigate to session when room is closed and has a session_id
  useEffect(() => {
    if (room && room.status === 'closed' && room.session_id) {
      navigate(`/session/${room.session_id}`);
    }
  }, [room?.status, room?.session_id, navigate]);

  const handleStart = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const data = await startRoom(code);
      setRoom(data);
    } catch (err) {
      setActionError(err.message || 'Failed to start recording.');
    } finally {
      setActionLoading(false);
    }
  }, [code]);

  const handleStop = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const data = await stopRoom(code);
      setRoom(data);
      // If stop returns a session_id, navigate to it
      if (data.session_id) {
        navigate(`/session/${data.session_id}`);
      }
    } catch (err) {
      setActionError(err.message || 'Failed to stop recording.');
    } finally {
      setActionLoading(false);
    }
  }, [code, navigate]);

  function handleCopyCode() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

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

  if (!room) return null;

  const isRecording = room.status === 'recording';
  const isWaiting = room.status === 'waiting';
  const isProcessing = room.status === 'processing';

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
        <div className="inline-flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-neutral-900">
            {code}
          </h1>
          <button
            onClick={handleCopyCode}
            className="text-neutral-500 hover:text-neutral-700 transition-colors"
            aria-label="Copy room code"
          >
            <Copy size={16} strokeWidth={1.5} />
          </button>
          {copied && (
            <span className="text-xs text-neutral-400">Copied</span>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="mt-8 flex items-center gap-3">
        <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
          Status
        </span>
        <span className={`text-sm font-medium ${statusColor(room.status)}`}>
          {room.status}
        </span>
        {isRecording && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
          </span>
        )}
      </div>

      {/* Host */}
      {room.host_name && (
        <div className="mt-4">
          <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
            Host
          </span>
          <p className="mt-1 text-sm text-neutral-700">{room.host_name}</p>
        </div>
      )}

      {/* Participants */}
      <div className="mt-6">
        <ParticipantList
          participants={participants}
          hostName={room.host_name}
        />
      </div>

      {/* Live Transcript */}
      <div className="mt-8">
        <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
          Live Transcript
        </span>
        <div className="mt-4">
          <LiveTranscript chunks={chunks} />
        </div>
      </div>

      {/* Action error */}
      {actionError && (
        <p className="mt-6 text-sm text-red-600">{actionError}</p>
      )}

      {/* Controls */}
      <div className="mt-8 flex gap-4">
        {isWaiting && (
          <button
            onClick={handleStart}
            disabled={actionLoading}
            className="bg-neutral-900 text-white text-sm font-medium px-5 py-2.5 hover:bg-neutral-800 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Mic size={16} strokeWidth={1.5} />
            {actionLoading ? 'Starting...' : 'Start Recording'}
          </button>
        )}
        {isRecording && (
          <button
            onClick={handleStop}
            disabled={actionLoading}
            className="bg-neutral-900 text-white text-sm font-medium px-5 py-2.5 hover:bg-neutral-800 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Square size={16} strokeWidth={1.5} />
            {actionLoading ? 'Stopping...' : 'Stop Recording'}
          </button>
        )}
        {isProcessing && (
          <p className="text-sm text-amber-600">
            Processing transcript...
          </p>
        )}
      </div>
    </div>
  );
}
