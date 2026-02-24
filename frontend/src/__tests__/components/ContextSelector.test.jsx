import { render, screen, fireEvent } from '@testing-library/react';
import ContextSelector from '../../components/ContextSelector';

describe('ContextSelector', () => {
  const onSelect = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 5 context options', () => {
    render(<ContextSelector selected={null} onSelect={onSelect} />);

    expect(screen.getByText('Class Lecture')).toBeInTheDocument();
    expect(screen.getByText('Startup Meeting')).toBeInTheDocument();
    expect(screen.getByText('Research Discussion')).toBeInTheDocument();
    expect(screen.getByText('Working Session')).toBeInTheDocument();
    expect(screen.getByText('Talk / Seminar')).toBeInTheDocument();
  });

  it('renders all options as buttons', () => {
    render(<ContextSelector selected={null} onSelect={onSelect} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
  });

  it('calls onSelect with the context id when clicked', () => {
    render(<ContextSelector selected={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Startup Meeting').closest('button'));
    expect(onSelect).toHaveBeenCalledWith('startup_meeting');

    fireEvent.click(screen.getByText('Class Lecture').closest('button'));
    expect(onSelect).toHaveBeenCalledWith('class_lecture');
  });

  it('applies selected styling to the chosen context', () => {
    render(<ContextSelector selected="research_discussion" onSelect={onSelect} />);

    const selectedButton = screen.getByText('Research Discussion').closest('button');
    expect(selectedButton.className).toContain('border-orange-400/50');
    expect(selectedButton.className).toContain('bg-orange-500/10');
  });

  it('does not apply selected styling to unselected contexts', () => {
    render(<ContextSelector selected="research_discussion" onSelect={onSelect} />);

    const unselectedButton = screen.getByText('Class Lecture').closest('button');
    expect(unselectedButton.className).not.toContain('border-orange-400/50');
    expect(unselectedButton.className).toContain('border-white/10');
  });

  it('renders descriptions for each context', () => {
    render(<ContextSelector selected={null} onSelect={onSelect} />);

    expect(screen.getByText('Lectures, seminars, academic sessions')).toBeInTheDocument();
    expect(screen.getByText('Team syncs, standups, strategy')).toBeInTheDocument();
    expect(screen.getByText('Lab meetings, paper reviews, methodology')).toBeInTheDocument();
    expect(screen.getByText('Brainstorms, workshops, ideation')).toBeInTheDocument();
    expect(screen.getByText('Keynotes, panels, presentations')).toBeInTheDocument();
  });
});
