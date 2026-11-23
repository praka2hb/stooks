'use client';

import { useEffect, useRef, useState } from 'react';
import { closeWalletPicker, connectWallet, disconnectWallet, discoverWallets, isLive, openWalletPicker, usesDevKey } from '../lib/chain';
import { useWallet } from '../lib/onchain';

export const shortAddress = address => `${address.slice(0, 6)}…${address.slice(-4)}`;

// Shown when no wallet is installed. Any EIP-6963 wallet that supports Base works; these are common ones.
const getWallets = [
  ['Coinbase Wallet', 'https://www.coinbase.com/wallet/downloads'],
  ['MetaMask', 'https://metamask.io/download/'],
  ['Rabby', 'https://rabby.io/'],
];

function WalletPicker({ wallets, error }) {
  const [busy, setBusy] = useState('');
  const dialog = useRef(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  async function pick(detail) {
    setBusy(detail.info.rdns);
    try { await connectWallet(detail); } catch { /* error is shown from wallet state */ }
    setBusy('');
  }
  return (
    <dialog ref={dialog} className="wallet-dialog" aria-labelledby="wallet-title" onClose={closeWalletPicker} onClick={e => e.target === dialog.current && dialog.current.close()}>
      <div className="wallet-dialog-head">
        <h2 id="wallet-title">Connect a wallet</h2>
        <button type="button" className="wallet-close" aria-label="Close" onClick={() => dialog.current.close()}>×</button>
      </div>
      {wallets.length ? (
        <ul className="wallet-list">
          {wallets.map(w => (
            <li key={w.info.rdns}>
              <button type="button" onClick={() => pick(w)} disabled={Boolean(busy)}>
                {w.info.icon ? <img src={w.info.icon} alt="" /> : <span className="wallet-icon-blank" aria-hidden="true" />}
                <span>{w.info.name}</span>
                <small>{busy === w.info.rdns ? 'Check your wallet…' : 'Detected'}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="wallet-none">
          <p>No browser wallet found. Install one that supports Base, then reload this page.</p>
          <ul>{getWallets.map(([name, href]) => <li key={name}><a href={href} target="_blank" rel="noopener noreferrer">{name}</a></li>)}</ul>
        </div>
      )}
      {error && <p className="wallet-error" role="alert">{error}</p>}
      <p className="wallet-foot">Stooks runs on Base. Your wallet will be asked to switch to it.</p>
    </dialog>
  );
}

export function WalletButton() {
  const { address, info, wallets, picker, error } = useWallet();
  const [menu, setMenu] = useState(false);
  useEffect(() => { discoverWallets(); }, []);
  if (!isLive) return <span className="demo-label">Demo</span>;
  return (
    <>
      {address ? (
        <span className="wallet-menu-wrap">
          <button type="button" className="wallet-chip" title={address} aria-expanded={menu} onClick={() => setMenu(m => !m)}>
            {info?.icon && <img src={info.icon} alt="" />}{usesDevKey ? 'Test wallet · ' : ''}{shortAddress(address)}
          </button>
          {menu && (
            <span className="wallet-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { navigator.clipboard?.writeText(address); setMenu(false); }}>Copy address</button>
              <a role="menuitem" href={`https://basescan.org/address/${address}`} target="_blank" rel="noopener noreferrer">View on Basescan</a>
              {!usesDevKey && <button type="button" role="menuitem" onClick={() => { disconnectWallet(); setMenu(false); }}>Disconnect</button>}
            </span>
          )}
        </span>
      ) : (
        <button type="button" className="button button-primary wallet-button" onClick={openWalletPicker}>Connect wallet</button>
      )}
      {picker && <WalletPicker wallets={wallets} error={error} />}
    </>
  );
}
