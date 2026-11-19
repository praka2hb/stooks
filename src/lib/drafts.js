'use client';

import { useSyncExternalStore } from 'react';
import { stocks, rules } from './market-data.mjs';

const key = 'stockhooks-preview-v1';
const eventName = 'stockhooks-drafts-changed';
const empty = [];
let lastValue = null;
let lastDrafts = empty;

function readDrafts() {
  try {
    const value = window.localStorage.getItem(key);
    if (value === lastValue) return lastDrafts;

    const parsed = JSON.parse(value ?? '[]');
    lastDrafts = Array.isArray(parsed) ? parsed.filter(coin =>
      coin && typeof coin.id === 'string' && coin.id.startsWith('demo-') &&
      typeof coin.name === 'string' && typeof coin.symbol === 'string' &&
      stocks.some(stock => stock.id === coin.stock) &&
      Array.isArray(coin.rules) && coin.rules.every(rule => Object.hasOwn(rules, rule)) &&
      ['cap', 'volume', 'change', 'vault', 'age', 'payout'].every(field => Number.isFinite(coin[field])) &&
      coin.cap > 0
    ) : empty;
    lastValue = value;
    return lastDrafts;
  } catch {
    return empty;
  }
}

function subscribe(onChange) {
  function onStorage(event) {
    if (event.key === key || event.key === null) onChange();
  }
  window.addEventListener('storage', onStorage);
  window.addEventListener(eventName, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(eventName, onChange);
  };
}

export function useDrafts() {
  return useSyncExternalStore(subscribe, readDrafts, () => empty);
}

export function saveDraft(coin) {
  window.localStorage.setItem(key, JSON.stringify([coin, ...readDrafts()]));
  window.dispatchEvent(new Event(eventName));
}
