'use client';

import { useState } from 'react';
import { connectWallet, isLive, usesDevKey } from '../lib/chain';
import { useWallet } from '../lib/onchain';

export const shortAddress = address => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function WalletButton() {
  const { address } = useWallet();
  const [error, setError] = useState('');
  if (!isLive) return <span className="demo-label">Demo</span>;
  if (address) return <span className="wallet-chip" title={address}>{usesDevKey ? 'Test wallet · ' : ''}{shortAddress(address)}</span>;
  return (
    <button
      type="button"
      className="button button-primary wallet-button"
      title={error || undefined}
      onClick={() => connectWallet().then(() => setError(''), e => setError(e.shortMessage || e.message))}
    >
      {error ? 'Retry wallet' : 'Connect wallet'}
    </button>
  );
}
