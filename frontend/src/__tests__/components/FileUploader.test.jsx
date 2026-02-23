import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../lib/api', () => ({
  uploadAudio: vi.fn(),
}));

import { uploadAudio } from '../../lib/api';
import FileUploader from '../../components/FileUploader';

describe('FileUploader', () => {
  const onComplete = vi.fn();
  const onError = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders upload prompt text', () => {
    render(<FileUploader sessionId="s1" onComplete={onComplete} onError={onError} />);
    expect(screen.getByText('Drop audio file here or click to browse')).toBeInTheDocument();
  });

  it('shows accepted formats', () => {
    render(<FileUploader sessionId="s1" onComplete={onComplete} onError={onError} />);
    expect(screen.getByText('.mp3, .wav, .m4a, .webm, .ogg')).toBeInTheDocument();
  });

  it('has a hidden file input with correct accept attribute', () => {
    const { container } = render(
      <FileUploader sessionId="s1" onComplete={onComplete} onError={onError} />
    );
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();
    expect(input.accept).toBe('.mp3,.wav,.m4a,.webm,.ogg');
    expect(input.className).toContain('hidden');
  });

  it('calls onError for unsupported file types', () => {
    const { container } = render(
      <FileUploader sessionId="s1" onComplete={onComplete} onError={onError} />
    );
    const input = container.querySelector('input[type="file"]');

    const invalidFile = new File(['content'], 'document.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [invalidFile] } });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toContain('Unsupported file type');
  });

  it('shows progress bar during upload', async () => {
    // Make uploadAudio return a promise that never resolves (simulates ongoing upload)
    uploadAudio.mockReturnValue(new Promise(() => {}));

    const { container } = render(
      <FileUploader sessionId="s1" onComplete={onComplete} onError={onError} />
    );
    const input = container.querySelector('input[type="file"]');

    const validFile = new File(['audio'], 'recording.mp3', { type: 'audio/mpeg' });
    fireEvent.change(input, { target: { files: [validFile] } });

    // Should show uploading state with file name
    expect(await screen.findByText(/Uploading recording\.mp3/)).toBeInTheDocument();
    // The prompt text should not be visible during upload
    expect(screen.queryByText('Drop audio file here or click to browse')).not.toBeInTheDocument();
  });
});
