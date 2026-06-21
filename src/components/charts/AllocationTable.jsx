import { formatIndianCurrency, toNum } from '../../lib/utils';

export function withAllocationPercent(data, valueKey = 'value', total) {
  const sum = total ?? data.reduce((s, d) => s + toNum(d[valueKey] ?? d.amount ?? d.value), 0);
  return [...data]
    .map((d) => {
      const amount = toNum(d[valueKey] ?? d.amount ?? d.value);
      return {
        ...d,
        amount,
        pct: sum > 0 ? (amount / sum) * 100 : (d.pct ?? 0),
      };
    })
    .sort((a, b) => toNum(b.amount) - toNum(a.amount));
}

export function AllocationTable({ rows, showTotal = true, emptyMessage = 'No data' }) {
  if (!rows.length) {
    return <p className="text-sm text-slate-500 text-center py-8">{emptyMessage}</p>;
  }

  const total = rows.reduce((s, r) => s + toNum(r.amount ?? r.value), 0);

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const amount = toNum(row.amount ?? row.value);
        const pct = row.pct ?? 0;
        const key = row.id ?? row.name;

        return (
          <div
            key={key}
            className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-3.5 transition-colors hover:border-slate-200 dark:hover:border-slate-700"
          >
            <div className="flex items-start justify-between gap-3 mb-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white dark:ring-slate-900 shadow-sm"
                  style={{ backgroundColor: row.color || '#64748b' }}
                />
                <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 leading-snug">
                  {row.name}
                </span>
              </div>
              <div className="text-right shrink-0 leading-tight">
                <p className="font-bold text-sm text-slate-900 dark:text-white">{formatIndianCurrency(amount)}</p>
                <p className="text-xs text-slate-500 mt-0.5">({pct.toFixed(1)}%)</p>
              </div>
            </div>
            <div className="h-2 rounded-full bg-slate-200/70 dark:bg-slate-700/70 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: row.color || '#64748b' }}
              />
            </div>
          </div>
        );
      })}

      {showTotal && (
        <div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-200 dark:border-slate-700 px-1">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Total</span>
          <span className="font-bold text-base text-indigo-600 dark:text-indigo-400">{formatIndianCurrency(total)}</span>
        </div>
      )}
    </div>
  );
}
