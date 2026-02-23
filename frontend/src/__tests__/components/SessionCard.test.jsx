import { render, screen, fireEvent } from '@testing-library/react';
import SessionCard from '../../components/SessionCard';

describe('SessionCard', () => {
  const baseSession = {
    id: 'sess-1',
    title: 'Weekly Standup',
    context: 'startup_meeting',
    created_at: '2025-01-15T14:30:00Z',
    duration_seconds: 2700,
    status: 'complete',
    room_code: null,
  };

  const onClick = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders session title', () => {
    render(<SessionCard session={baseSession} onClick={onClick} />);
    expect(screen.getByText('Weekly Standup')).toBeInTheDocument();
  });

  it('renders "Untitled Session" when title is null', () => {
    const session = { ...baseSession, title: null };
    render(<SessionCard session={session} onClick={onClick} />);
    expect(screen.getByText('Untitled Session')).toBeInTheDocument();
  });

  it('shows context label', () => {
    render(<SessionCard session={baseSession} onClick={onClick} />);
    expect(screen.getByText('Startup Meeting')).toBeInTheDocument();
  });

  it('shows formatted date and duration', () => {
    render(<SessionCard session={baseSession} onClick={onClick} />);
    // Duration of 2700s = 45 min
    expect(screen.getByText(/45 min/)).toBeInTheDocument();
  });

  it('shows room code when present', () => {
    const session = { ...baseSession, room_code: 'ABC-123' };
    render(<SessionCard session={session} onClick={onClick} />);
    expect(screen.getByText(/Room ABC-123/)).toBeInTheDocument();
  });

  it('shows status when not "complete"', () => {
    const session = { ...baseSession, status: 'recording' };
    render(<SessionCard session={session} onClick={onClick} />);
    expect(screen.getByText('recording')).toBeInTheDocument();
  });

  it('hides status when status is "complete"', () => {
    render(<SessionCard session={baseSession} onClick={onClick} />);
    expect(screen.queryByText('complete')).not.toBeInTheDocument();
  });

  it('calls onClick with session.id when clicked', () => {
    render(<SessionCard session={baseSession} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith('sess-1');
  });
});
