import { useEffect, useRef } from 'react';

/**
 * LiveTranscript displays a scrolling transcript feed.
 * Props:
 *  - chunks: array of { text, is_final, timestamp_ms }
 *  - fullTranscript: optional string of full transcript text
 */
export default function LiveTranscript({ chunks, fullTranscript }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chunks, fullTranscript]);

  return (
    <div className="card p-4 md:p-6 min-h-[200px] max-h-[480px] overflow-y-auto eb-scrollbar">
      {fullTranscript ? (
        <p className="font-mono text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {fullTranscript}
        </p>
      ) : chunks && chunks.length > 0 ? (
        <div className="space-y-1">
          {chunks.map((chunk, i) => (
            <span
              key={i}
              className={`font-mono text-sm leading-relaxed ${
                chunk.is_final ? 'text-zinc-300' : 'text-zinc-500'
              }`}
            >
              {chunk.text}{' '}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Waiting for transcript...</p>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
