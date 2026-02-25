import { render, screen } from '@testing-library/react';
import LiveTranscript from '../../components/LiveTranscript';

// jsdom does not implement scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('LiveTranscript', () => {
  it('shows "Waiting for transcript..." when no chunks and no fullTranscript', () => {
    render(<LiveTranscript chunks={[]} fullTranscript={null} />);
    expect(screen.getByText('Waiting for transcript...')).toBeInTheDocument();
  });

  it('shows "Waiting for transcript..." when chunks is undefined', () => {
    render(<LiveTranscript chunks={undefined} fullTranscript={null} />);
    expect(screen.getByText('Waiting for transcript...')).toBeInTheDocument();
  });

  it('shows fullTranscript when provided', () => {
    render(
      <LiveTranscript chunks={[]} fullTranscript="This is the complete transcript." />
    );
    expect(screen.getByText('This is the complete transcript.')).toBeInTheDocument();
  });

  it('shows individual chunks when provided and no fullTranscript', () => {
    const chunks = [
      { text: 'Hello there', is_final: true, timestamp_ms: 1000 },
      { text: 'how are you', is_final: false, timestamp_ms: 2000 },
    ];
    render(<LiveTranscript chunks={chunks} fullTranscript={null} />);
    expect(screen.getByText(/Hello there/)).toBeInTheDocument();
    expect(screen.getByText(/how are you/)).toBeInTheDocument();
  });

  it('applies text-zinc-300 to final chunks and text-zinc-500 to non-final', () => {
    const chunks = [
      { text: 'Final chunk', is_final: true, timestamp_ms: 1000 },
      { text: 'Pending chunk', is_final: false, timestamp_ms: 2000 },
    ];
    render(<LiveTranscript chunks={chunks} fullTranscript={null} />);

    const finalEl = screen.getByText(/Final chunk/);
    const pendingEl = screen.getByText(/Pending chunk/);

    expect(finalEl.className).toContain('text-zinc-300');
    expect(pendingEl.className).toContain('text-zinc-500');
  });

  it('fullTranscript takes priority over chunks', () => {
    const chunks = [
      { text: 'chunk text', is_final: true, timestamp_ms: 1000 },
    ];
    render(
      <LiveTranscript chunks={chunks} fullTranscript="Full transcript text" />
    );
    expect(screen.getByText('Full transcript text')).toBeInTheDocument();
    expect(screen.queryByText(/chunk text/)).not.toBeInTheDocument();
  });
});
