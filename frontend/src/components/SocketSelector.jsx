import { useState, useEffect } from 'react';
import { listSockets, listLenses } from '../lib/api';

/**
 * SocketSelector allows choosing a lens (preset or socket) for interpretation.
 * Props:
 *  - onSelect({ lens_type, lens_id }): called when user picks a lens/socket
 *  - value: current selection { lens_type, lens_id }
 */
export default function SocketSelector({ onSelect, value }) {
  const [sockets, setSockets] = useState([]);
  const [lenses, setLenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listSockets(), listLenses()])
      .then(([s, l]) => {
        setSockets(Array.isArray(s) ? s : []);
        setLenses(Array.isArray(l) ? l : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-zinc-400">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      {lenses.length > 0 && (
        <div>
          <span className="section-label">
            Preset Lenses
          </span>
          <p className="text-xs text-zinc-400 mt-1">Lenses shape how the AI reads your transcript. Each produces a different type of output.</p>
          <div className="mt-2 grid gap-2">
            {lenses.map((lens) => {
              const isSelected = value?.lens_type === 'preset' && value?.lens_id === lens.id;
              return (
                <button
                  key={lens.id}
                  onClick={() => onSelect({ lens_type: 'preset', lens_id: lens.id })}
                  className={`card w-full text-left px-4 py-3 transition-all duration-200 touch-target ${
                    isSelected
                      ? 'border-accent-border bg-accent-muted text-white'
                      : 'border-border text-zinc-400 hover:bg-zinc-800 hover:border-border-hover'
                  }`}
                >
                  <span className={`font-medium ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                    {lens.name || lens.id}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {sockets.length > 0 && (
        <div>
          <span className="section-label">
            Sockets
          </span>
          <p className="text-xs text-zinc-400 mt-1">Custom templates you've created for specific analysis needs.</p>
          <div className="mt-2 grid gap-2">
            {sockets.map((socket) => {
              const isSelected = value?.lens_type === 'socket' && value?.lens_id === socket.id;
              return (
                <button
                  key={socket.id}
                  onClick={() => onSelect({ lens_type: 'socket', lens_id: socket.id })}
                  className={`card w-full text-left px-4 py-3 transition-all duration-200 touch-target ${
                    isSelected
                      ? 'border-accent-border bg-accent-muted text-white'
                      : 'border-border text-zinc-400 hover:bg-zinc-800 hover:border-border-hover'
                  }`}
                >
                  <span className={`font-medium ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                    {socket.name}
                  </span>
                  {socket.description && (
                    <span className="block mt-0.5 text-zinc-400">{socket.description}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
