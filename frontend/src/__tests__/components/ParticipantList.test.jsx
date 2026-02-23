import { render, screen } from '@testing-library/react';
import ParticipantList from '../../components/ParticipantList';

describe('ParticipantList', () => {
  it('shows "No participants yet." when empty array', () => {
    render(<ParticipantList participants={[]} hostName="Alice" />);
    expect(screen.getByText('No participants yet.')).toBeInTheDocument();
  });

  it('shows "No participants yet." when null', () => {
    render(<ParticipantList participants={null} hostName="Alice" />);
    expect(screen.getByText('No participants yet.')).toBeInTheDocument();
  });

  it('renders participant names', () => {
    const participants = [
      { name: 'Alice', participant_type: 'human' },
      { name: 'Bob', participant_type: 'human' },
    ];
    render(<ParticipantList participants={participants} hostName="Alice" />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows "(host)" label for host participant', () => {
    const participants = [
      { name: 'Alice', participant_type: 'human' },
      { name: 'Bob', participant_type: 'human' },
    ];
    render(<ParticipantList participants={participants} hostName="Alice" />);
    expect(screen.getByText('(host)')).toBeInTheDocument();
  });

  it('does not show "(host)" for non-host participants', () => {
    const participants = [
      { name: 'Alice', participant_type: 'human' },
    ];
    render(<ParticipantList participants={participants} hostName="SomeoneElse" />);
    expect(screen.queryByText('(host)')).not.toBeInTheDocument();
  });

  it('renders "Participants" heading', () => {
    render(<ParticipantList participants={[]} hostName="Alice" />);
    expect(screen.getByText('Participants')).toBeInTheDocument();
  });

  it('renders "Participants" heading when participants are present', () => {
    const participants = [
      { name: 'Alice', participant_type: 'human' },
      { name: 'AgentX', participant_type: 'agent' },
    ];
    render(<ParticipantList participants={participants} hostName="Alice" />);
    expect(screen.getByText('Participants')).toBeInTheDocument();
  });
});
