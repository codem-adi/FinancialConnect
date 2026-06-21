import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Pencil, X, AlertCircle, Check, Landmark, Coins, Home, Wallet,
  Package, TrendingUp, PiggyBank, ChevronDown, ChevronUp, User, History,
  ArrowDownCircle, ArrowUpCircle, RefreshCw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useUiSection } from '../../hooks/useUiSection';
import { formatIndianCurrency, toNum } from '../../lib/utils';
import {
  TYPE_CONFIG, ASSET_SUBTYPES, groupAssetsByType, getTotalActiveAssets, getAssetValue,
  getFdGrowthDetails, getElapsedSince, computeFdValue, createAssetPayload, recordPurchase, recordSale,
  recordValueUpdate, getSubtypeOptionsForType, normalizeAsset,
} from '../../lib/assetCalculations';
import { buildAssetAudit } from '../../lib/auditSummaries';
import { AllocationTable, withAllocationPercent } from '../charts/AllocationTable';
import { Card, Btn, InputField, Badge, StatCard, ProgressBar, ConfirmDialog, PageHeader } from '../ui';

const TYPE_ICONS = {
  equity: TrendingUp, debt: Landmark, gold: Coins, real_estate: Home, cash: Wallet, other: Package,
};

const AMOUNT_INPUT = { emptyZero: false };


function HistoryTimeline({ history }) {
  if (!history?.length) return null;
  const labels = { purchase: 'Purchased', sale: 'Sold', value_update: 'Value updated' };
  const icons = { purchase: ArrowUpCircle, sale: ArrowDownCircle, value_update: RefreshCw };
  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
      <p className="text-[10px] font-semibold uppercase text-slate-400 mb-2 flex items-center gap-1">
        <History className="w-3 h-3" /> History
      </p>
      <div className="space-y-1.5 max-h-32 overflow-y-auto">
        {[...history].reverse().slice(0, 5).map((h) => {
          const Icon = icons[h.type] || RefreshCw;
          return (
            <div key={h.id} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <Icon className="w-3 h-3 shrink-0" />
                {labels[h.type] || h.type} · {h.date}
              </span>
              <span className="font-medium">{formatIndianCurrency(h.amount || h.value, false)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssetFormModal({
  title, initial, preset, familyMembers, onSave, onClose, confirmLabel = 'Yes, save',
}) {
  const defaultType = preset?.type || initial?.type || 'equity';
  const defaultSubtype = preset?.subtype || initial?.subtype || null;

  const [draft, setDraft] = useState({
    name: initial?.name || '',
    type: defaultType,
    subtype: defaultSubtype || '',
    value: initial?.value ?? '',
    principal: initial?.principal ?? initial?.purchasePrice ?? '',
    purchasePrice: initial?.purchasePrice ?? '',
    annualReturn: initial?.annualReturn ?? '',
    autoCalculate: initial?.autoCalculate !== false,
    ownerId: initial?.ownerId || '',
    startDate: initial?.startDate || (initial ? '' : new Date().toISOString().split('T')[0]),
    notes: initial?.notes || '',
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const set = (field, value) => setDraft((d) => ({ ...d, [field]: value }));

  const subtypeOpts = getSubtypeOptionsForType(draft.type);
  const subtype = draft.subtype || null;
  const cfg = TYPE_CONFIG[draft.type] || TYPE_CONFIG.other;
  const isFd = subtype === 'fixed_deposit';
  const isMf = subtype === 'mutual_fund';
  const isProperty = draft.type === 'real_estate';

  const previewValue = isFd && draft.autoCalculate && draft.principal !== '' && draft.annualReturn && draft.startDate
    ? computeFdValue(draft.principal, draft.annualReturn, draft.startDate)
    : toNum(draft.value);

  const fdPreview = isFd && draft.startDate && draft.principal
    ? getFdGrowthDetails({
      subtype: 'fixed_deposit',
      principal: draft.principal,
      annualReturn: draft.annualReturn,
      startDate: draft.startDate,
      autoCalculate: draft.autoCalculate,
      value: draft.value,
    })
    : null;

  const buildPayload = () => {
    const payload = {
      name: draft.name.trim(),
      type: draft.type,
      subtype: subtype || null,
      value: previewValue,
      principal: toNum(isFd ? draft.principal : draft.purchasePrice || draft.value),
      purchasePrice: toNum(isProperty ? (draft.purchasePrice || draft.value) : draft.value),
      annualReturn: isFd ? toNum(draft.annualReturn) : 0,
      autoCalculate: isFd ? draft.autoCalculate : false,
      ownerId: draft.ownerId || null,
      startDate: draft.startDate,
      notes: draft.notes,
      status: initial?.status || 'active',
      history: initial?.history || [],
      lastValueUpdate: isMf ? new Date().toISOString().split('T')[0] : initial?.lastValueUpdate,
    };
    let asset = createAssetPayload(payload, initial?.id);
    if (!initial) {
      asset = recordPurchase(asset, {
        date: draft.startDate,
        amount: toNum(isFd ? draft.principal : draft.purchasePrice || previewValue),
        value: previewValue,
        notes: 'Initial entry',
      });
    }
    return asset;
  };

  const handleApply = () => {
    if (!draft.name.trim()) return;
    setConfirmOpen(true);
  };

  const doSave = () => {
    onSave(buildPayload());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <InputField label="Name" value={draft.name} onChange={(v) => set('name', v)} placeholder={isProperty ? 'e.g. House — Andheri' : 'e.g. HDFC Flexi Cap'} />

          {!preset?.type && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Asset type</label>
                <select value={draft.type} onChange={(e) => set('type', e.target.value)} className="w-full">
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              {subtypeOpts.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Sub-category</label>
                  <select value={draft.subtype} onChange={(e) => set('subtype', e.target.value)} className="w-full">
                    <option value="">— Select —</option>
                    {subtypeOpts.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {(isMf || isFd) && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Owned by (family member)</label>
              <select value={draft.ownerId} onChange={(e) => set('ownerId', e.target.value)} className="w-full">
                <option value="">— Joint / Unassigned —</option>
                {familyMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.relationship})</option>
                ))}
              </select>
            </div>
          )}

          {isFd && (
            <div className="space-y-3 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">FD growth calculator</p>
              <InputField label="Deposit amount (principal)" type="number" value={draft.principal} onChange={(v) => set('principal', v)} suffix="₹" {...AMOUNT_INPUT} />
              <InputField label="Interest rate" type="number" value={draft.annualReturn} onChange={(v) => set('annualReturn', v)} suffix="% p.a." step={0.1} {...AMOUNT_INPUT} />
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Start date (when FD began)</label>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => set('startDate', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                <p className="text-[10px] text-slate-500 mt-1">Used with interest rate to calculate growth since this date</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.autoCalculate} onChange={(e) => set('autoCalculate', e.target.checked)} className="accent-indigo-600" />
                Auto-calculate current value from start date &amp; interest rate
              </label>
              {!draft.autoCalculate && (
                <InputField label="Current value (manual)" type="number" value={draft.value} onChange={(v) => set('value', v)} suffix="₹" {...AMOUNT_INPUT} />
              )}
              {draft.autoCalculate && !draft.startDate && (
                <p className="text-xs text-amber-600">Add a start date to calculate interest earned</p>
              )}
              {fdPreview?.canAutoCalc && (
                <div className="p-3 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-emerald-100 dark:border-emerald-900 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Since {draft.startDate}</span>
                    <span className="text-slate-600">{fdPreview.elapsed.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Principal</span>
                    <span>{formatIndianCurrency(fdPreview.principal, false)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-emerald-700 dark:text-emerald-300">
                    <span>Calculated today</span>
                    <span>{formatIndianCurrency(fdPreview.current)}</span>
                  </div>
                  {fdPreview.growth > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Interest earned</span>
                      <span>+{formatIndianCurrency(fdPreview.growth, false)} ({draft.annualReturn}% p.a.)</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {isMf && (
            <>
              <InputField label="Current value (update manually)" type="number" value={draft.value} onChange={(v) => set('value', v)} suffix="₹" {...AMOUNT_INPUT} />
              <p className="text-xs text-slate-500">Mutual funds are market-linked — update the value when NAV changes. Use 0 as a placeholder flag.</p>
            </>
          )}

          {isProperty && (
            <>
              <InputField label="Current market value" type="number" value={draft.value} onChange={(v) => set('value', v)} suffix="₹" {...AMOUNT_INPUT} />
              <InputField label="Purchase price" type="number" value={draft.purchasePrice} onChange={(v) => set('purchasePrice', v)} suffix="₹" {...AMOUNT_INPUT} />
              <InputField label="Purchase date" type="date" value={draft.startDate} onChange={(v) => set('startDate', v)} />
            </>
          )}

          {!isFd && !isMf && !isProperty && (
            <>
              <InputField label="Current value" type="number" value={draft.value} onChange={(v) => set('value', v)} suffix="₹" {...AMOUNT_INPUT} />
              <p className="text-xs text-slate-500">Enter 0 to keep this as a placeholder flag without affecting totals.</p>
            </>
          )}

          <InputField label="Notes (optional)" value={draft.notes} onChange={(v) => set('notes', v)} />

        </div>
        <div className="flex Gap-2 p-5 border-t border-slate-200 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-900">
          <Btn onClick={handleApply} className="flex-1" disabled={!draft.name.trim()}>Save</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        message={initial ? 'save changes to this asset' : 'add this asset'}
        detail={draft.name.trim() ? `"${draft.name.trim()}"` : undefined}
        onConfirm={doSave}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function SellAssetModal({ asset, onConfirm, onClose}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState(asset.value ?? '');
  const [notes, setNotes] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const doConfirm = () => {
    onConfirm({ date, amount: toNum(amount), notes });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold">Record sale — {asset.name}</h3>
          <button type="button" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <InputField label="Sale date" type="date" value={date} onChange={setDate} />
          <InputField label="Sale price" type="number" value={amount} onChange={setAmount} suffix="₹" {...AMOUNT_INPUT} />
          <InputField label="Notes" value={notes} onChange={setNotes} />
        </div>
        <div className="flex Gap-2 p-5 border-t border-slate-200 dark:border-slate-800">
          <Btn variant="danger" onClick={() => setConfirmOpen(true)} className="flex-1">Record sale</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        message="record this sale"
        detail={asset.name}
        variant="danger"
        onConfirm={doConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function UpdateValueModal({ asset, onConfirm, onClose}) {
  const [value, setValue] = useState(getAssetValue(asset));
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const doSave = () => {
    onConfirm({ value: toNum(value), date });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b"><h3 className="font-semibold">Update value — {asset.name}</h3></div>
        <div className="p-5 space-y-3">
          <InputField label="New value" type="number" value={value} onChange={setValue} suffix="₹" {...AMOUNT_INPUT} />
          <InputField label="As of date" type="date" value={date} onChange={setDate} />
        </div>
        <div className="flex Gap-2 p-5 border-t">
          <Btn className="flex-1" onClick={() => setConfirmOpen(true)}>Save</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        message="update this asset value"
        detail={asset.name}
        onConfirm={doSave}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function AssetItemCard({
  asset, ownerName, totalAssets, onEdit, onSell, onUpdateValue, onDelete,
  expanded, onToggleExpand, canEdit,
}) {
  const cfg = TYPE_CONFIG[asset.type] || TYPE_CONFIG.other;
  const val = asset.effectiveValue ?? getAssetValue(asset);
  const pct = totalAssets > 0 ? (val / totalAssets) * 100 : 0;
  const isSold = asset.status === 'sold';
  const fdGrowth = asset.subtype === 'fixed_deposit' ? getFdGrowthDetails(asset) : null;
  const subtypeLabel = asset.subtype ? ASSET_SUBTYPES[asset.subtype]?.label : null;

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-shadow ${isSold ? 'opacity-60 border-slate-200 dark:border-slate-800' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 hover:shadow-md'}`}
      style={{ borderLeftWidth: 3, borderLeftColor: isSold ? '#94a3b8' : cfg.color }}
    >
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm truncate">{asset.name}</p>
              {isSold && <Badge color="indigo">Sold</Badge>}
              {subtypeLabel && !isSold && <Badge color={cfg.badge}>{subtypeLabel}</Badge>}
              {!isSold && val === 0 && <Badge color="amber">Placeholder</Badge>}
            </div>
            <p className="text-lg font-bold mt-0.5" style={{ color: isSold ? '#94a3b8' : val === 0 ? '#94a3b8' : cfg.color }}>
              {isSold ? '—' : formatIndianCurrency(val, false)}
            </p>
            {!isSold && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-slate-500">
                {ownerName && <span className="flex items-center gap-0.5"><User className="w-3 h-3" />{ownerName}</span>}
                {fdGrowth && (
                  <>
                    {fdGrowth.startDate && (
                      <span>Since {fdGrowth.startDate}{fdGrowth.elapsed?.label ? ` · ${fdGrowth.elapsed.label}` : ''}</span>
                    )}
                    {fdGrowth.canAutoCalc && fdGrowth.growth > 0 && (
                      <span className="text-emerald-600">
                        +{formatIndianCurrency(fdGrowth.growth, false)} interest ({fdGrowth.annualReturn}%)
                      </span>
                    )}
                    {fdGrowth.autoCalculate && !fdGrowth.canAutoCalc && (
                      <span className="text-amber-600">Set start date &amp; rate to auto-calculate</span>
                    )}
                  </>
                )}
                {asset.subtype === 'mutual_fund' && asset.lastValueUpdate && (
                  <span>Updated {asset.lastValueUpdate}</span>
                )}
                {!isSold && pct > 0 && <span>{pct.toFixed(1)}% of portfolio</span>}
              </div>
            )}
          </div>
          {!isSold && canEdit && (
            <div className="flex flex-col gap-0.5 shrink-0">
              {asset.subtype === 'mutual_fund' && (
                <Btn variant="ghost" size="sm" onClick={onUpdateValue} title="Update NAV value"><RefreshCw className="w-3.5 h-3.5" /></Btn>
              )}
              <Btn variant="ghost" size="sm" onClick={onEdit}><Pencil className="w-3.5 h-3.5" /></Btn>
              {(asset.type === 'real_estate' || asset.subtype === 'mutual_fund' || asset.subtype === 'fixed_deposit') && (
                <Btn variant="ghost" size="sm" onClick={onSell} className="!text-amber-600" title="Record sale"><ArrowDownCircle className="w-3.5 h-3.5" /></Btn>
              )}
              <Btn variant="ghost" size="sm" onClick={onDelete} className="!text-red-500"><Trash2 className="w-3.5 h-3.5" /></Btn>
            </div>
          )}
        </div>

        {asset.history?.length > 0 && (
          <button type="button" onClick={onToggleExpand} className="mt-2 text-[10px] text-indigo-600 flex items-center gap-1">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Hide' : 'Show'} history ({asset.history.length})
          </button>
        )}
        {expanded && <HistoryTimeline history={asset.history} />}


      </div>
    </div>
  );
}

function AssetTypeSection({
  group, familyMembers, totalAssets, onAdd, onEdit, onSell, onUpdateValue, onDelete,
  expandedHistoryId, setExpandedHistoryId, collapsed, onToggleCollapsed, canEdit,
}) {
  const Icon = TYPE_ICONS[group.type] || Package;
  const addLabel = group.type === 'real_estate' ? 'Add property'
    : group.type === 'equity' ? 'Add mutual fund / stock'
      : group.type === 'debt' ? 'Add fixed deposit'
        : 'Add item';

  const ownerName = (id) => familyMembers.find((m) => m.id === id)?.name;

  return (
    <Card className="!p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => onToggleCollapsed(group.type)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${group.color}18` }}>
            <Icon className="w-5 h-5" style={{ color: group.color }} />
          </div>
          <div className="text-left">
            <p className="font-semibold">{group.label}</p>
            <p className="text-xs text-slate-500">
              {group.activeCount} active{group.soldCount > 0 ? ` · ${group.soldCount} sold` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="font-bold text-lg" style={{ color: group.color }}>{formatIndianCurrency(group.activeTotal)}</p>
          {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          {group.items.map((asset) => (
            <AssetItemCard
              key={asset.id}
              asset={asset}
              ownerName={ownerName(asset.ownerId)}
              totalAssets={totalAssets}
              onEdit={() => onEdit(asset)}
              onSell={() => onSell(asset)}
              onUpdateValue={() => onUpdateValue(asset)}
              onDelete={() => onDelete(asset.id)}
              expanded={expandedHistoryId === asset.id}
              onToggleExpand={() => setExpandedHistoryId(expandedHistoryId === asset.id ? null : asset.id)}
              canEdit={canEdit}
            />
          ))}
          {canEdit && (
            <Btn size="sm" variant="secondary" className="w-full mt-1" onClick={() => onAdd(group.type)}>
              <Plus className="w-3.5 h-3.5 inline mr-1" />{addLabel}
            </Btn>
          )}
        </div>
      )}
    </Card>
  );
}

export function AssetsTab() {
  const { data, updateFinance, generateId: genId, canEdit } = useApp();
  const pf = data.personalFinance;
  const familyMembers = pf.familyMembers || [];
  const [assetsUi, setAssetsUi] = useUiSection('assets');

  const [showAdd, setShowAdd] = useState(null);
  const [editAsset, setEditAsset] = useState(null);
  const [sellAsset, setSellAsset] = useState(null);
  const [updateValueAsset, setUpdateValueAsset] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const collapsedTypes = assetsUi.collapsedTypes || {};
  const isCollapsed = (type) => collapsedTypes[type] !== false;
  const toggleCollapsed = (type) => {
    setAssetsUi({
      collapsedTypes: { ...collapsedTypes, [type]: !isCollapsed(type) },
    });
  };
  const expandedHistoryId = assetsUi.expandedHistoryId;
  const setExpandedHistoryId = (id) => setAssetsUi({ expandedHistoryId: id });

  const totalAssets = useMemo(() => getTotalActiveAssets(pf.assets), [pf.assets]);
  const groups = useMemo(() => groupAssetsByType(pf.assets), [pf.assets]);
  const activeCount = useMemo(() => pf.assets.filter((a) => a.status !== 'sold').length, [pf.assets]);

  const chartData = useMemo(() => {
    return withAllocationPercent(
      groups.filter((g) => g.activeTotal > 0).map((g) => ({
        name: g.label,
        value: g.activeTotal,
        color: g.color,
      })),
      'value',
      totalAssets,
    );
  }, [groups, totalAssets]);

  const saveAssets = (assets, audit) => updateFinance({ ...pf, assets }, audit);

  const addAsset = (payload) => {
    const asset = { ...payload, id: genId() };
    saveAssets([...pf.assets, asset], buildAssetAudit(null, asset, 'create'));
  };

  const updateAsset = (id, payload) => {
    const before = pf.assets.find((a) => a.id === id);
    const after = { ...normalizeAsset(before), ...payload, id };
    saveAssets(
      pf.assets.map((a) => (a.id === id ? after : a)),
      buildAssetAudit(before, after, 'update'),
    );
    setEditAsset(null);
  };

  const removeAsset = (id) => {
    const asset = pf.assets.find((a) => a.id === id);
    saveAssets(pf.assets.filter((a) => a.id !== id), buildAssetAudit(null, asset, 'delete'));
    setPendingDeleteId(null);
  };

  const handleSell = (asset, { date, amount, notes }) => {
    const updated = recordSale(normalizeAsset(asset), { date, amount, notes });
    saveAssets(pf.assets.map((a) => (a.id === asset.id ? updated : a)), {
      section: 'assets',
      action: 'update',
      entityId: asset.id,
      summary: `Sold asset ${asset.name}: ${formatIndianCurrency(amount)} on ${date}`,
      details: notes || null,
    });
    setSellAsset(null);
  };

  const handleValueUpdate = (asset, { value, date }) => {
    const before = normalizeAsset(asset);
    const updated = recordValueUpdate(before, { value, date });
    saveAssets(pf.assets.map((a) => (a.id === asset.id ? updated : a)), {
      section: 'assets',
      action: 'update',
      entityId: asset.id,
      summary: `Revalued ${asset.name}: ${formatIndianCurrency(before.value)} → ${formatIndianCurrency(value)} (${date})`,
    });
    setUpdateValueAsset(null);
  };

  const presetForAdd = (type) => {
    if (type === 'real_estate') return { type: 'real_estate', subtype: 'house' };
    if (type === 'equity') return { type: 'equity', subtype: 'mutual_fund' };
    if (type === 'debt') return { type: 'debt', subtype: 'fixed_deposit' };
    return { type };
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <PageHeader
        title="Assets"
        subtitle="Properties, mutual funds, FDs & more — grouped with buy/sell history"
        action={canEdit ? (
          <Btn className="w-full sm:w-auto" onClick={() => setShowAdd({})}>
            <Plus className="w-4 h-4 inline mr-1" />Add Asset
          </Btn>
        ) : null}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard label="Total Portfolio" value={formatIndianCurrency(totalAssets)} sub={`${activeCount} active holding(s)`} color="indigo" />
        {groups.filter((g) => g.activeTotal > 0).slice(0, 3).map((g) => (
          <StatCard
            key={g.type}
            label={g.label}
            value={formatIndianCurrency(g.activeTotal)}
            sub={`${g.activeCount} item(s) · ${totalAssets > 0 ? ((g.activeTotal / totalAssets) * 100).toFixed(1) : 0}%`}
            color={g.type === 'equity' ? 'indigo' : g.type === 'debt' ? 'green' : g.type === 'gold' ? 'amber' : 'blue'}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card title="Allocation" subtitle="By category" className="lg:col-span-2">
          {chartData.length > 0 ? (
            <AllocationTable rows={chartData} />
          ) : (
            <div className="text-center py-12 text-slate-500">
              <PiggyBank className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Add assets to see allocation</p>
            </div>
          )}
        </Card>

        <div className="lg:col-span-3 space-y-3">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Your Assets <span className="text-slate-400 font-normal">· {formatIndianCurrency(totalAssets)}</span>
          </p>

          {groups.length === 0 ? (
            <Card className="text-center py-12">
              <Landmark className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">{canEdit ? 'No assets yet' : 'No assets recorded'}</p>
              {canEdit && (
                <Btn size="sm" className="mt-3" onClick={() => setShowAdd({})}>
                  <Plus className="w-3 h-3 inline mr-1" />Add your first asset
                </Btn>
              )}
            </Card>
          ) : (
            groups.map((group) => (
              <AssetTypeSection
                key={group.type}
                group={group}
                familyMembers={familyMembers}
                totalAssets={totalAssets}
                onAdd={(type) => setShowAdd(presetForAdd(type))}
                onEdit={setEditAsset}
                onSell={setSellAsset}
                onUpdateValue={setUpdateValueAsset}
                onDelete={setPendingDeleteId}
                expandedHistoryId={expandedHistoryId}
                setExpandedHistoryId={setExpandedHistoryId}
                collapsed={isCollapsed(group.type)}
                onToggleCollapsed={toggleCollapsed}
                canEdit={canEdit}
              />
            ))
          )}
        </div>
      </div>

      {showAdd !== null && (
        <AssetFormModal
          title="Add asset"
          preset={showAdd}
          familyMembers={familyMembers}
          onSave={addAsset}
          onClose={() => setShowAdd(null)}
          confirmLabel="Yes, add asset"
        />
      )}

      {editAsset && (
        <AssetFormModal
          title="Edit asset"
          initial={editAsset}
          familyMembers={familyMembers}
          onSave={(payload) => updateAsset(editAsset.id, payload)}
          onClose={() => setEditAsset(null)}
          confirmLabel="Yes, save changes"
        />
      )}

      {sellAsset && (
        <SellAssetModal
          asset={sellAsset}
          onConfirm={(data) => handleSell(sellAsset, data)}
          onClose={() => setSellAsset(null)}
        />
      )}

      {updateValueAsset && (
        <UpdateValueModal
          asset={updateValueAsset}
          onConfirm={(data) => handleValueUpdate(updateValueAsset, data)}
          onClose={() => setUpdateValueAsset(null)}
        />
      )}

      <ConfirmDialog
        open={!!pendingDeleteId}
        message="delete this asset"
        detail={pf.assets.find((a) => a.id === pendingDeleteId)?.name}
        variant="danger"
        onConfirm={() => { removeAsset(pendingDeleteId); setPendingDeleteId(null); }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
