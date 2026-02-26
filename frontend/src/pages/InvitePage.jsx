import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Copy, Check, AlertCircle } from 'lucide-react';
import { previewInvite, claimInvite } from '../lib/api';

export default function InvitePage() {
  const { token } = useParams();

  const [state, setState] = useState('loading'); // loading | ready | claimed | error
  const [invite, setInvite] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [agentName, setAgentName] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSkill, setCopiedSkill] = useState(false);

  useEffect(() => {
    previewInvite(token)
      .then((data) => {
        setInvite(data);
        // Default agent name from token
        const suffix = token.slice(-8);
        setAgentName(`agent-${suffix}`);
        setState('ready');
      })
      .catch((err) => {
        const msg = err.message || '';
        if (msg.includes('410')) {
          setErrorMsg('This invite has already been claimed.');
        } else if (msg.includes('404')) {
          setErrorMsg('Invite not found. Check the URL and try again.');
        } else {
          setErrorMsg('Could not load invite. It may have expired or been revoked.');
        }
        setState('error');
      });
  }, [token]);

  async function handleClaim() {
    if (!agentName.trim()) return;
    setClaiming(true);
    try {
      const result = await claimInvite(token, agentName.trim());
      setClaimResult(result);
      setState('claimed');
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('410')) {
        setErrorMsg('This invite has already been claimed.');
      } else if (msg.includes('400')) {
        setErrorMsg('Agent name must not be blank.');
      } else {
        setErrorMsg('Failed to claim invite. It may have expired.');
      }
      setState('error');
    } finally {
      setClaiming(false);
    }
  }

  function copyToClipboard(text, setter) {
    navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 2000);
    });
  }

  // Loading state
  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-darker">
        <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-darker p-4">
        <div className="max-w-md w-full">
          <div className="bg-surface-dark border border-border rounded-xl p-6 md:p-8 text-center">
            <AlertCircle size={32} className="text-red-400 mx-auto mb-4" strokeWidth={1.5} />
            <h1 className="text-lg font-semibold text-zinc-200">Invite Unavailable</h1>
            <p className="mt-2 text-sm text-zinc-400">{errorMsg}</p>
          </div>
          <p className="mt-4 text-center text-xs text-zinc-500">
            EchoBridge
          </p>
        </div>
      </div>
    );
  }

  // Claimed state — show key + SKILL.md
  if (state === 'claimed' && claimResult) {
    return (
      <div className="min-h-screen bg-surface-darker p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-surface-dark border border-border rounded-xl p-6 md:p-8">
            <h1 className="text-lg font-semibold text-zinc-200">
              Connection Ready
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Agent <span className="text-zinc-300 font-medium">{claimResult.agent_name}</span> is configured.
            </p>

            {/* API Key */}
            <div className="mt-6 p-4 bg-zinc-900/60 border border-zinc-700 rounded-lg">
              <p className="text-sm text-amber-400 font-medium">
                Save this key now — it will not be shown again
              </p>
              <p className="mt-3 font-mono text-sm text-zinc-300 break-all select-all">
                {claimResult.api_key}
              </p>
              <button
                onClick={() => copyToClipboard(claimResult.api_key, setCopiedKey)}
                className="mt-3 btn-secondary inline-flex items-center gap-2"
              >
                {copiedKey ? (
                  <><Check size={16} strokeWidth={1.5} /> Copied!</>
                ) : (
                  <><Copy size={16} strokeWidth={1.5} /> Copy Key</>
                )}
              </button>
            </div>

            {/* SKILL.md */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
                  Skill File
                </span>
                <button
                  onClick={() => copyToClipboard(claimResult.skill_md, setCopiedSkill)}
                  className="btn-secondary inline-flex items-center gap-2 text-sm"
                >
                  {copiedSkill ? (
                    <><Check size={16} strokeWidth={1.5} /> Copied!</>
                  ) : (
                    <><Copy size={16} strokeWidth={1.5} /> Copy Skill</>
                  )}
                </button>
              </div>
              <pre className="mt-3 p-4 bg-zinc-900/60 border border-zinc-700 rounded-lg font-mono text-xs text-zinc-400 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                {claimResult.skill_md}
              </pre>
              <p className="mt-2 text-xs text-zinc-500">
                Paste this into your agent's skills directory or knowledge base. The API URL and key are already embedded.
              </p>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-zinc-500">
            EchoBridge
          </p>
        </div>
      </div>
    );
  }

  // Ready state — show claim form
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-darker p-4">
      <div className="max-w-md w-full">
        <div className="bg-surface-dark border border-border rounded-xl p-6 md:p-8">
          <h1 className="text-lg font-semibold text-zinc-200">
            EchoBridge Invite
          </h1>
          {invite?.label && (
            <p className="mt-1 text-sm text-zinc-400">{invite.label}</p>
          )}
          {invite?.expires_at && (
            <p className="mt-2 text-xs text-zinc-500">
              Expires {new Date(invite.expires_at).toLocaleDateString()}
            </p>
          )}

          <label className="block mt-6">
            <span className="text-sm font-medium text-zinc-300">Agent Name</span>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="my-agent"
              className="eb-input w-full text-base px-4 py-3 rounded-xl mt-2"
            />
            <p className="mt-1 text-xs text-zinc-500">
              This name identifies your agent in EchoBridge.
            </p>
          </label>

          <button
            onClick={handleClaim}
            disabled={claiming || !agentName.trim()}
            className="mt-6 w-full btn-primary py-3 disabled:opacity-50"
          >
            {claiming ? 'Claiming...' : 'Claim Invite'}
          </button>
        </div>
        <p className="mt-4 text-center text-xs text-zinc-500">
          EchoBridge
        </p>
      </div>
    </div>
  );
}
