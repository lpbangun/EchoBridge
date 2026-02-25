/**
 * Simple markdown-to-JSX preview component.
 * Renders markdown content as formatted React elements.
 * All rendering is done via safe React elements only.
 */
export default function MarkdownPreview({ content }) {
  if (!content) {
    return (
      <p className="text-sm text-zinc-400">No content available.</p>
    );
  }

  const lines = content.split('\n');

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();

        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={i} className="text-base font-medium text-zinc-200 mt-4 mb-1">
              {renderInline(trimmed.slice(4))}
            </h3>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={i} className="text-lg font-medium text-white mt-6 mb-2">
              {renderInline(trimmed.slice(3))}
            </h2>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={i} className="text-xl font-bold text-white mt-6 mb-2">
              {renderInline(trimmed.slice(2))}
            </h1>
          );
        }
        if (trimmed.startsWith('- [ ] ') || trimmed.startsWith('- [x] ')) {
          const checked = trimmed.startsWith('- [x] ');
          const text = trimmed.slice(6);
          return (
            <div key={i} className="flex items-start gap-2 text-base text-zinc-300">
              <span className={`mt-0.5 ${checked ? 'text-green-400' : 'text-zinc-400'}`}>
                {checked ? '\u2611' : '\u2610'}
              </span>
              <span>{renderInline(text)}</span>
            </div>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={i} className="flex items-start gap-2 text-base text-zinc-300 leading-relaxed">
              <span className="text-accent mt-0.5">&bull;</span>
              <span>{renderInline(trimmed.slice(2))}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s(.*)/);
          return (
            <div key={i} className="flex items-start gap-2 text-base text-zinc-300 leading-relaxed">
              <span className="text-accent font-medium min-w-[1.5rem]">{match[1]}.</span>
              <span>{renderInline(match[2])}</span>
            </div>
          );
        }
        if (trimmed === '---' || trimmed === '***') {
          return <hr key={i} className="border-border my-4" />;
        }
        if (trimmed === '') {
          return <div key={i} className="h-2" />;
        }

        return (
          <p key={i} className="text-base text-zinc-300 leading-relaxed">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Parse inline markdown (bold, italic, code) into React elements.
 * Uses pure React rendering for safety.
 */
function renderInline(text) {
  if (!text) return null;

  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(<strong key={key++} className="font-bold text-white">{boldMatch[2]}</strong>);
      remaining = boldMatch[3];
      continue;
    }

    // Italic: *text*
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/s);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
      parts.push(<em key={key++}>{italicMatch[2]}</em>);
      remaining = italicMatch[3];
      continue;
    }

    // Code: `text`
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/s);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>);
      parts.push(
        <code key={key++} className="font-mono text-sm bg-zinc-800 text-accent px-1.5 py-0.5 rounded">
          {codeMatch[2]}
        </code>
      );
      remaining = codeMatch[3];
      continue;
    }

    // Plain text remainder
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
