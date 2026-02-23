import { render, screen, fireEvent } from '@testing-library/react';
import InterpretationCard from '../../components/InterpretationCard';

describe('InterpretationCard', () => {
  const baseInterpretation = {
    id: 'interp-1',
    source_type: 'human',
    source_name: null,
    lens_type: 'preset',
    lens_id: 'action_items',
    model: 'gpt-4o',
    is_primary: false,
    output_markdown: '# Summary\nSome content here.',
  };

  it('renders source label "You" for non-agent source', () => {
    render(<InterpretationCard interpretation={baseInterpretation} />);
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('shows "Agent: <name>" for agent source', () => {
    const interp = {
      ...baseInterpretation,
      source_type: 'agent',
      source_name: 'ResearchBot',
    };
    render(<InterpretationCard interpretation={interp} />);
    expect(screen.getByText('Agent: ResearchBot')).toBeInTheDocument();
  });

  it('shows lens label for preset lens', () => {
    render(<InterpretationCard interpretation={baseInterpretation} />);
    expect(screen.getByText(/action_items lens/)).toBeInTheDocument();
  });

  it('shows lens label for socket lens', () => {
    const interp = {
      ...baseInterpretation,
      lens_type: 'socket',
      lens_id: 'my_socket',
    };
    render(<InterpretationCard interpretation={interp} />);
    expect(screen.getByText(/my_socket socket/)).toBeInTheDocument();
  });

  it('shows lens label for custom lens', () => {
    const interp = {
      ...baseInterpretation,
      lens_type: 'custom',
      lens_id: null,
    };
    render(<InterpretationCard interpretation={interp} />);
    expect(screen.getByText('Custom lens')).toBeInTheDocument();
  });

  it('shows model name', () => {
    render(<InterpretationCard interpretation={baseInterpretation} />);
    expect(screen.getByText(/gpt-4o/)).toBeInTheDocument();
  });

  it('shows "Primary" badge when is_primary is true', () => {
    const interp = { ...baseInterpretation, is_primary: true };
    render(<InterpretationCard interpretation={interp} />);
    expect(screen.getByText('Primary')).toBeInTheDocument();
  });

  it('does not show "Primary" badge when is_primary is false', () => {
    render(<InterpretationCard interpretation={baseInterpretation} />);
    expect(screen.queryByText('Primary')).not.toBeInTheDocument();
  });

  it('content is hidden by default', () => {
    render(<InterpretationCard interpretation={baseInterpretation} />);
    expect(screen.queryByText('Some content here.')).not.toBeInTheDocument();
  });

  it('clicking expands to show content, clicking again collapses', () => {
    render(<InterpretationCard interpretation={baseInterpretation} />);

    // Expand
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Some content here.')).toBeInTheDocument();

    // Collapse
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('Some content here.')).not.toBeInTheDocument();
  });
});
