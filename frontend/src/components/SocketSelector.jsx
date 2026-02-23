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
    return <p className="text-sm text-neutral-500">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      {lenses.length > 0 && (
        <div>
          <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
            Preset Lenses
          </span>
          <div className="mt-2 grid gap-2">
            {lenses.map((lens) => (
              <button
                key={lens.id}
                onClick={() => onSelect({ lens_type: 'preset', lens_id: lens.id })}
                className={`w-full text-left px-4 py-3 border transition-colors text-sm ${
                  value?.lens_type === 'preset' && value?.lens_id === lens.id
                    ? 'border-neutral-900 text-neutral-900'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-400'
                }`}
              >
                {lens.name || lens.id}
              </button>
            ))}
          </div>
        </div>
      )}
      {sockets.length > 0 && (
        <div>
          <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
            Sockets
          </span>
          <div className="mt-2 grid gap-2">
            {sockets.map((socket) => (
              <button
                key={socket.id}
                onClick={() => onSelect({ lens_type: 'socket', lens_id: socket.id })}
                className={`w-full text-left px-4 py-3 border transition-colors text-sm ${
                  value?.lens_type === 'socket' && value?.lens_id === socket.id
                    ? 'border-neutral-900 text-neutral-900'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-400'
                }`}
              >
                <span className="font-medium">{socket.name}</span>
                {socket.description && (
                  <span className="block mt-0.5 text-neutral-500">{socket.description}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
