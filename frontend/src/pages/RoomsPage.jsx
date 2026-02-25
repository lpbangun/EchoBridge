import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, ArrowRight } from 'lucide-react';
import { joinRoom } from '../lib/api';

export default function RoomsPage() {
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
      setError(err.message || 'Failed to join room.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-white">Rooms</h1>
          <p className="text-sm text-zinc-400 mt-1">Join or create collaborative meeting rooms.</p>
        </div>
        <button
          onClick={() => navigate('/new')}
          className="btn-primary inline-flex items-center gap-2 text-sm"
        >
          <Plus size={14} strokeWidth={2} />
          Create Room
        </button>
      </div>

      {/* Join room form */}
      <form onSubmit={handleJoin} className="card-lg p-6 mt-8">
        <h2 className="font-display text-base font-bold text-white">Join a Room</h2>
        <p className="text-sm text-zinc-400 mt-1">Enter the code shared by the room host.</p>

        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          <div>
            <label className="section-label">Room Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ROOM-0000"
              className="eb-input w-full px-3 py-2.5 text-sm font-mono mt-2"
            />
          </div>
          <div>
            <label className="section-label">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alice"
              className="eb-input w-full px-3 py-2.5 text-sm mt-2"
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <div className="mt-6">
          <button
            type="submit"
            disabled={joining}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Users size={14} strokeWidth={1.5} />
            {joining ? 'Joining...' : 'Join Room'}
          </button>
        </div>
      </form>
    </div>
  );
}
