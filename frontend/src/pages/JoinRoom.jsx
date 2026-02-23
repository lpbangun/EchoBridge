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
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">
          JOIN ROOM
        </h1>
      </div>

      {/* Form */}
      <form onSubmit={handleJoin} className="mt-12">
        {/* Room Code */}
        <div>
          <label className="text-xs font-medium tracking-widest uppercase text-neutral-500">
            Room Code
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ROOM-0000"
            className="mt-2 w-full text-base px-4 py-3 border border-neutral-200 bg-white placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none transition-colors"
            autoFocus
          />
        </div>

        {/* Name */}
        <div className="mt-8">
          <label className="text-xs font-medium tracking-widest uppercase text-neutral-500">
            Your Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alice"
            className="mt-2 w-full text-base px-4 py-3 border border-neutral-200 bg-white placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none transition-colors"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="mt-8 text-sm text-red-600">{error}</p>
        )}

        {/* Submit */}
        <div className="mt-12">
          <button
            type="submit"
            disabled={joining}
            className="bg-neutral-900 text-white text-sm font-medium px-5 py-2.5 hover:bg-neutral-800 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Users size={16} strokeWidth={1.5} />
            {joining ? 'Joining...' : 'Join Room'}
          </button>
        </div>
      </form>
    </div>
  );
}
