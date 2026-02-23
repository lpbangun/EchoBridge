import { render, screen } from '@testing-library/react';
import MarkdownPreview from '../../components/MarkdownPreview';

describe('MarkdownPreview', () => {
  it('shows "No content available." when content is null', () => {
    render(<MarkdownPreview content={null} />);
    expect(screen.getByText('No content available.')).toBeInTheDocument();
  });

  it('shows "No content available." when content is empty string', () => {
    render(<MarkdownPreview content="" />);
    expect(screen.getByText('No content available.')).toBeInTheDocument();
  });

  it('renders h1 headings', () => {
    render(<MarkdownPreview content="# Main Title" />);
    const heading = screen.getByText('Main Title');
    expect(heading.closest('h1')).toBeInTheDocument();
  });

  it('renders h2 headings', () => {
    render(<MarkdownPreview content="## Section Title" />);
    const heading = screen.getByText('Section Title');
    expect(heading.closest('h2')).toBeInTheDocument();
  });

  it('renders h3 headings', () => {
    render(<MarkdownPreview content="### Subsection" />);
    const heading = screen.getByText('Subsection');
    expect(heading.closest('h3')).toBeInTheDocument();
  });

  it('renders bullet list items', () => {
    render(<MarkdownPreview content={'- First item\n- Second item'} />);
    expect(screen.getByText('First item')).toBeInTheDocument();
    expect(screen.getByText('Second item')).toBeInTheDocument();
  });

  it('renders numbered list items', () => {
    render(<MarkdownPreview content={'1. Step one\n2. Step two'} />);
    expect(screen.getByText('Step one')).toBeInTheDocument();
    expect(screen.getByText('Step two')).toBeInTheDocument();
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
  });

  it('renders bold text in strong tags', () => {
    render(<MarkdownPreview content="This is **bold** text" />);
    const strong = screen.getByText('bold');
    expect(strong.tagName).toBe('STRONG');
  });

  it('renders italic text in em tags', () => {
    render(<MarkdownPreview content="This is *italic* text" />);
    const em = screen.getByText('italic');
    expect(em.tagName).toBe('EM');
  });

  it('renders inline code', () => {
    render(<MarkdownPreview content="Use `console.log` here" />);
    const code = screen.getByText('console.log');
    expect(code.tagName).toBe('CODE');
  });

  it('renders horizontal rule', () => {
    const { container } = render(<MarkdownPreview content={'Above\n---\nBelow'} />);
    const hr = container.querySelector('hr');
    expect(hr).not.toBeNull();
  });

  it('renders plain paragraphs', () => {
    render(<MarkdownPreview content="Just a plain paragraph." />);
    // renderInline wraps text in a span inside a p element
    const textEl = screen.getByText('Just a plain paragraph.');
    expect(textEl.closest('p')).not.toBeNull();
  });

  it('renders unchecked checkboxes', () => {
    render(<MarkdownPreview content="- [ ] Todo item" />);
    expect(screen.getByText('Todo item')).toBeInTheDocument();
    // Unchecked checkbox uses the ballot box character
    expect(screen.getByText('\u2610')).toBeInTheDocument();
  });

  it('renders checked checkboxes', () => {
    render(<MarkdownPreview content="- [x] Done item" />);
    expect(screen.getByText('Done item')).toBeInTheDocument();
    // Checked checkbox uses the ballot box with check character
    expect(screen.getByText('\u2611')).toBeInTheDocument();
  });
});
