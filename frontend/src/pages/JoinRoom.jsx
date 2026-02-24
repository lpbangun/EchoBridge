import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { joinRoom } from '../lib/api';

export default function JoinRoom() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);

  async function handleJoin(e) {
    e.preventDefault();

    if (!code.trim()) {
      setError('Room code is required.');
      return;
    }
    if (!name.trim()) {
      setError('Your name is required.');
      return;
    }

    setJoining(true);
    setError(null);
    try {
      await joinRoom({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        type: 'human',
      });
      navigate(`/room/${code.trim().toUpperCase()}`);
    } catch (err) {
      setError(err.message || 'Failed to join room. Check the code and try again.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-12 safe-area-inset">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="text-slate-400 hover:text-orange-400 transition-colors inline-flex items-center gap-2 text-sm font-medium touch-target"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
          Back
        </button>
        <h1 className="text-lg md:text-xl font-semibold text-slate-100">
          JOIN ROOM
        </h1>
      </div>

      {/* Description */}
      <p className="mt-6 text-sm text-slate-400">Enter the room code shared by the host to join a live session.</p>

      {/* Form */}
      <form onSubmit={handleJoin} className="mt-8">
        <div className="glass rounded-xl p-4 md:p-8">
          {/* Room Code */}
          <div>
            <label className="section-label">
              Room Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ROOM-0000"
              className="glass-input w-full text-base px-4 py-3 rounded-xl mt-2 font-mono placeholder:font-mono"
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-1">Ask the person who created the room for this code.</p>
          </div>

          {/* Name */}
          <div className="mt-8">
            <label className="section-label">
              Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alice"
              className="glass-input w-full text-base px-4 py-3 rounded-xl mt-2"
            />
            <p className="text-xs text-slate-500 mt-1">How you'll appear to other participants.</p>
          </div>

          {/* Error */}
          {error && (
            <p className="mt-8 text-sm text-red-400">{error}</p>
          )}

          {/* Submit */}
          <div className="mt-8">
            <button
              type="submit"
              disabled={joining}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 touch-target"
            >
              <Users size={16} strokeWidth={1.5} />
              {joining ? 'Joining...' : 'Join Room'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
