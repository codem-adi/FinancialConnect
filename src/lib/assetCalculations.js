import { toNum } from './utils';

export const ASSET_SUBTYPES = {
  house: { label: 'House / Property', type: 'real_estate', color: '#8b5cf6' },
  plot: { label: 'Plot / Land', type: 'real_estate', color: '#a78bfa' },
  commercial: { label: 'Commercial', type: 'real_estate', color: '#7c3aed' },
  mutual_fund: { label: 'Mutual Fund', type: 'equity', color: '#6366f1' },
  stocks: { label: 'Stocks', type: 'equity', color: '#818cf8' },
  fixed_deposit: { label: 'Fixed Deposit', type: 'debt', color: '#10b981' },
};

export const TYPE_CONFIG = {
  equity: { label: 'Equity / MF', color: '#6366f1', badge: 'indigo' },
  debt: { label: 'Debt / FD', color: '#10b981', badge: 'green' },
  gold: { label: 'Gold', color: '#f59e0b', badge: 'amber' },
  real_estate: { label: 'Real Estate', color: '#8b5cf6', badge: 'indigo' },
  cash: { label: 'Cash', color: '#06b6d4', badge: 'blue' },
  other: { label: 'Other', color: '#64748b', badge: 'indigo' },
};

export function computeFdValue(principal, annualRatePct, startDate, asOf = new Date()) {
  const p = toNum(principal);
  const r = toNum(annualRatePct) / 100;
  if (p <= 0) return 0;
  if (r <= 0) return p;
  const start = parseDate(startDate);
  if (!start) return p;
  const end = asOf instanceof Date ? asOf : new Date(asOf);
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return p;
  const years = ms / (365.25 * 24 * 60 * 60 * 1000);
  const quarters = years * 4;
  return Math.round(p * (1 + r / 4) ** quarters);
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getElapsedSince(startDate, asOf = new Date()) {
  const start = parseDate(startDate);
  if (!start) return { years: 0, months: 0, label: '' };
  const end = asOf instanceof Date ? asOf : new Date(asOf);
  const ms = Math.max(0, end.getTime() - start.getTime());
  const years = ms / (365.25 * 24 * 60 * 60 * 1000);
  const months = Math.floor(years * 12);
  const y = Math.floor(months / 12);
  const m = months % 12;
  const label = y > 0 && m > 0 ? `${y}y ${m}mo` : y > 0 ? `${y} year${y > 1 ? 's' : ''}` : m > 0 ? `${m} month${m > 1 ? 's' : ''}` : 'Less than 1 month';
  return { years, months, label };
}

export function getFdGrowthDetails(asset, asOf = new Date()) {
  const a = normalizeAsset(asset);
  if (a.subtype !== 'fixed_deposit') return null;
  const principal = toNum(a.principal);
  const current = getAssetValue(a, asOf);
  const elapsed = getElapsedSince(a.startDate, asOf);
  const canAutoCalc = a.autoCalculate && a.annualReturn > 0 && a.startDate;
  return {
    principal,
    current,
    growth: current - principal,
    annualReturn: a.annualReturn,
    startDate: a.startDate,
    autoCalculate: a.autoCalculate,
    canAutoCalc,
    elapsed,
  };
}

export function normalizeAsset(asset) {
  if (!asset) return asset;
  const subtype = asset.subtype || null;
  const principal = toNum(asset.principal ?? asset.purchasePrice ?? 0);
  return {
    id: asset.id,
    name: asset.name || 'Unnamed',
    type: asset.type || 'other',
    subtype,
    value: toNum(asset.value),
    principal: principal || toNum(asset.value),
    purchasePrice: toNum(asset.purchasePrice ?? asset.principal ?? asset.value),
    annualReturn: toNum(asset.annualReturn),
    autoCalculate: asset.subtype === 'fixed_deposit'
      ? (asset.autoCalculate !== false && toNum(asset.annualReturn) > 0 && !!(asset.startDate || asset.acquiredDate))
      : false,
    ownerId: asset.ownerId || null,
    startDate: asset.startDate || asset.acquiredDate || '',
    lastValueUpdate: asset.lastValueUpdate || '',
    status: asset.status || 'active',
    notes: asset.notes || '',
    history: Array.isArray(asset.history) ? asset.history : [],
  };
}

export function normalizeAssets(assets = []) {
  return assets.map(normalizeAsset);
}

export function getAssetValue(asset, asOf = new Date()) {
  const a = normalizeAsset(asset);
  if (a.status === 'sold') return 0;
  if (a.subtype === 'fixed_deposit' && a.autoCalculate && a.annualReturn > 0 && a.startDate) {
    return computeFdValue(a.principal, a.annualReturn, a.startDate, asOf);
  }
  return toNum(a.value);
}

export function getTotalActiveAssets(assets = [], asOf = new Date()) {
  return normalizeAssets(assets)
    .filter((a) => a.status !== 'sold')
    .reduce((s, a) => s + getAssetValue(a, asOf), 0);
}

/** Corpus for Financial Goals: MF/equity, FD, cash — excludes gold & real estate. */
const GOALS_CORPUS_TYPES = new Set(['equity', 'debt', 'cash']);
const GOALS_CORPUS_EXCLUDED_TYPES = new Set(['gold', 'real_estate']);
const GOALS_CORPUS_EXCLUDED_SUBTYPES = new Set(['house', 'plot', 'commercial']);

export function isGoalsCorpusAsset(asset) {
  const a = normalizeAsset(asset);
  if (a.status === 'sold') return false;
  if (GOALS_CORPUS_EXCLUDED_TYPES.has(a.type) || GOALS_CORPUS_EXCLUDED_SUBTYPES.has(a.subtype)) return false;
  return GOALS_CORPUS_TYPES.has(a.type);
}

export function getGoalsCorpus(assets = [], asOf = new Date()) {
  return normalizeAssets(assets)
    .filter(isGoalsCorpusAsset)
    .reduce((s, a) => s + getAssetValue(a, asOf), 0);
}

export function getFdGrowth(asset, asOf = new Date()) {
  const details = getFdGrowthDetails(asset, asOf);
  if (!details) return { current: getAssetValue(asset, asOf), growth: 0, principal: 0 };
  return {
    current: details.current,
    principal: details.principal,
    growth: details.growth,
    startDate: details.startDate,
    elapsed: details.elapsed,
    annualReturn: details.annualReturn,
  };
}

export function groupAssetsByType(assets = [], asOf = new Date()) {
  const normalized = normalizeAssets(assets);
  const groups = {};

  for (const asset of normalized) {
    const type = asset.type || 'other';
    if (!groups[type]) {
      groups[type] = { type, ...TYPE_CONFIG[type], items: [], activeTotal: 0, activeCount: 0, soldCount: 0 };
    }
    const val = getAssetValue(asset, asOf);
    groups[type].items.push({ ...asset, effectiveValue: val });
    if (asset.status === 'sold') {
      groups[type].soldCount += 1;
    } else {
      groups[type].activeTotal += val;
      groups[type].activeCount += 1;
    }
  }

  return Object.values(groups)
    .map((g) => ({
      ...g,
      items: g.items.sort((a, b) => {
        if (a.status === b.status) return b.effectiveValue - a.effectiveValue;
        return a.status === 'sold' ? 1 : -1;
      }),
    }))
    .sort((a, b) => b.activeTotal - a.activeTotal);
}

export function createAssetPayload(fields, id) {
  const a = normalizeAsset({ ...fields, id: id || fields.id });
  const value = a.subtype === 'fixed_deposit' && a.autoCalculate && a.annualReturn > 0 && a.startDate
    ? computeFdValue(a.principal, a.annualReturn, a.startDate)
    : toNum(a.value);

  return {
    ...a,
    value,
    lastValueUpdate: a.subtype === 'mutual_fund' ? (a.lastValueUpdate || new Date().toISOString().split('T')[0]) : a.lastValueUpdate,
  };
}

export function appendHistory(asset, entry) {
  return {
    ...asset,
    history: [...(asset.history || []), { id: entry.id, ...entry }],
  };
}

export function recordPurchase(asset, { date, amount, value, notes = '' }) {
  return appendHistory(asset, {
    id: entryId(),
    date: date || new Date().toISOString().split('T')[0],
    type: 'purchase',
    amount: toNum(amount),
    value: toNum(value ?? amount),
    notes,
  });
}

export function recordSale(asset, { date, amount, notes = '' }) {
  const sold = appendHistory(asset, {
    id: entryId(),
    date: date || new Date().toISOString().split('T')[0],
    type: 'sale',
    amount: toNum(amount),
    value: 0,
    notes,
  });
  return { ...sold, status: 'sold', value: 0 };
}

export function recordValueUpdate(asset, { date, value, notes = '' }) {
  const prev = getAssetValue(asset);
  const next = toNum(value);
  const updated = appendHistory(asset, {
    id: entryId(),
    date: date || new Date().toISOString().split('T')[0],
    type: 'value_update',
    amount: next - prev,
    value: next,
    notes: notes || `Updated from ${prev} to ${next}`,
  });
  return {
    ...updated,
    value: next,
    lastValueUpdate: date || new Date().toISOString().split('T')[0],
  };
}

function entryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getSubtypeOptionsForType(type) {
  return Object.entries(ASSET_SUBTYPES)
    .filter(([, cfg]) => cfg.type === type)
    .map(([key, cfg]) => ({ id: key, ...cfg }));
}

export function inferSubtypeFromLegacy(asset) {
  if (asset.subtype) return asset.subtype;
  const n = (asset.name || '').toLowerCase();
  if (asset.type === 'real_estate' || n.includes('house') || n.includes('property') || n.includes('flat')) return 'house';
  if (n.includes('mutual') || n.includes('mf')) return 'mutual_fund';
  if (n.includes('fixed deposit') || n.includes(' fd')) return 'fixed_deposit';
  if (n.includes('stock')) return 'stocks';
  return null;
}

export function migrateLegacyAssets(assets = []) {
  return normalizeAssets(assets).map((a) => {
    const subtype = a.subtype || inferSubtypeFromLegacy(a);
    const history = a.history.length ? a.history : [];
    const purchaseDate = history.find((h) => h.type === 'purchase')?.date;
    const startDate = a.startDate || purchaseDate || '';
    const isFd = subtype === 'fixed_deposit';
    return {
      ...a,
      subtype,
      startDate,
      principal: a.principal || (isFd ? a.value : a.purchasePrice),
      purchasePrice: a.purchasePrice || a.value,
      autoCalculate: isFd ? (toNum(a.annualReturn) > 0 && !!startDate && a.autoCalculate !== false) : false,
      history: history.length ? history : (startDate || a.status === 'active'
        ? [{
          id: entryId(),
          date: startDate || new Date().toISOString().split('T')[0],
          type: 'purchase',
          amount: a.purchasePrice || a.value,
          value: a.value,
          notes: 'Imported',
        }]
        : []),
    };
  });
}
