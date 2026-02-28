import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SettingsPage from '../../pages/SettingsPage';

// --- Mocks ---

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
}));

vi.mock('../../lib/api', () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  createApiKey: vi.fn(),
  listApiKeys: vi.fn().mockResolvedValue([]),
  deleteApiKey: vi.fn(),
  testCloudConnection: vi.fn(),
  getStorageStatus: vi.fn(),
  getSkillMd: vi.fn().mockResolvedValue(''),
  listSockets: vi.fn().mockResolvedValue([]),
  createInvite: vi.fn(),
  listInvites: vi.fn().mockResolvedValue([]),
  revokeInvite: vi.fn(),
  listWebhooks: vi.fn().mockResolvedValue({ webhooks: [], count: 0 }),
  createWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  executeWebhook: vi.fn(),
}));

import { getSettings, updateSettings, createApiKey, testCloudConnection, getStorageStatus } from '../../lib/api';

// --- Helpers ---

const MOCK_SETTINGS = {
  user_display_name: 'Alice',
  ai_provider: 'openrouter',
  default_model: 'x-ai/grok-4.1-fast',
  output_dir: '/output',
  auto_export: true,
  include_transcript_in_md: false,
  whisper_model: 'small',
  openrouter_api_key_set: true,
  openai_api_key_set: false,
  anthropic_api_key_set: false,
  google_api_key_set: false,
  xai_api_key_set: false,
  models: {
    'x-ai/grok-4.1-fast': 'Grok 4.1 Fast',
    'google/gemini-3-flash-preview': 'Gemini 3 Flash',
  },
  provider_models: {
    openrouter: {
      'x-ai/grok-4.1-fast': 'Grok 4.1 Fast',
      'google/gemini-3-flash-preview': 'Gemini 3 Flash',
    },
    openai: {
      'gpt-4o': 'GPT-4o',
    },
    anthropic: {
      'claude-sonnet-4-6-latest': 'Claude Sonnet 4.6',
    },
    google: {
      'gemini-2.5-flash': 'Gemini 2.5 Flash',
    },
    xai: {
      'grok-3': 'Grok 3',
    },
  },
  cloud_storage_enabled: false,
  s3_endpoint_url: '',
  s3_access_key_id: '',
  s3_secret_configured: false,
  s3_bucket_name: '',
  s3_region: 'auto',
  s3_prefix: 'echobridge/',
  cloud_sync_audio: true,
  cloud_sync_exports: true,
};

// --- Tests ---

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSettings.mockResolvedValue(MOCK_SETTINGS);
    updateSettings.mockResolvedValue(MOCK_SETTINGS);
    createApiKey.mockResolvedValue({ key: 'eb-test-key-abc123', name: 'my-agent' });
  });

  it('shows loading state initially', () => {
    getSettings.mockReturnValue(new Promise(() => {}));
    render(<SettingsPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders "SETTINGS" header after loading', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('SETTINGS')).toBeInTheDocument();
    });
  });

  it('shows Display Name input with value from settings', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Alice')).toBeInTheDocument();
    });
  });

  it('shows Default Model selector', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Default Model')).toBeInTheDocument();
    });
    // The select should have the model options (format: "Name — id")
    expect(screen.getByText('Grok 4.1 Fast — x-ai/grok-4.1-fast')).toBeInTheDocument();
    expect(screen.getByText('Gemini 3 Flash — google/gemini-3-flash-preview')).toBeInTheDocument();
  });

  it('shows Whisper Model selector', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Whisper Model')).toBeInTheDocument();
    });
    // Current value should be 'small'
    expect(screen.getByDisplayValue('small')).toBeInTheDocument();
  });

  it('shows Export checkboxes (auto-export, include transcript)', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Auto-export after interpretation')).toBeInTheDocument();
    });
    expect(screen.getByText('Include transcript in .md export')).toBeInTheDocument();

    // auto_export is true in mock settings
    const autoExportCheckbox = screen.getByText('Auto-export after interpretation')
      .closest('label')
      .querySelector('input[type="checkbox"]');
    expect(autoExportCheckbox.checked).toBe(true);

    // include_transcript_in_md is false in mock settings
    const includeTranscriptCheckbox = screen.getByText('Include transcript in .md export')
      .closest('label')
      .querySelector('input[type="checkbox"]');
    expect(includeTranscriptCheckbox.checked).toBe(false);
  });

  it('shows Save Settings button', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });
  });

  it('shows Connected Agents section', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Connected Agents')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('my-agent')).toBeInTheDocument();
  });

  it('shows error state when getSettings fails', async () => {
    getSettings.mockRejectedValue(new Error('Failed to fetch settings'));
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch settings')).toBeInTheDocument();
    });
  });

});
