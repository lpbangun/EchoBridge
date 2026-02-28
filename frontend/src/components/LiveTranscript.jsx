import { useEffect, useRef } from 'react';

/**
 * Parse a line that starts with `[Speaker N]: ...` into label + body parts.
 * Returns { label, body } if matched, or null if the line is not diarized.
 */
export function parseSpeakerLine(line) {
  const match = line.match(/^\[Speaker (\d+)\]:\s*(.*)/);
  if (!match) return null;
  return {
    label: `[Speaker ${match[1]}]`,
    body: match[2],
  };
}

/**
 * Render a single transcript line, color-coding speaker labels if diarized.
 */
function TranscriptLine({ line }) {
  const parsed = parseSpeakerLine(line);
  if (!parsed) {
    return <span className="text-zinc-300">{line}</span>;
  }
  return (
    <span>
      <span className="text-lime-400 font-medium">{parsed.label}</span>
      <span className="text-zinc-300"> {parsed.body}</span>
    </span>
  );
}

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
        <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
          {fullTranscript.split('\n').map((line, i) => (
            <div key={i}>
              <TranscriptLine line={line} />
            </div>
          ))}
        </div>
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
