import { useMemo, useState, useRef } from 'react';
import { Plus, Trash2, Calendar, TrendingDown, TrendingUp, IndianRupee, Car, CreditCard, PauseCircle, ArrowDownCircle, Pencil, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useUiSection } from '../../hooks/useUiSection';
import { formatIndianCurrency, toNum } from '../../lib/utils';
import {
  getMonthKey, formatMonthLabel, computeMonthStats, getMonthRecord, upsertMonthRecord, getPastMonths,
  DEFAULT_EXPENSE_CATEGORIES, getPrepaymentsForMonth, getPreviousMonthKey, hasMonthExpenseData,
} from '../../lib/financeStats';
import { computeLoanStats } from '../../lib/loanCalculations';
import { buildExpenseMonthAudit } from '../../lib/auditSummaries';
import { Card, Btn, InputField, StatCard, ProgressBar, PageHeader } from '../ui';

export function ExpensesTab() {
  const { data, updateFinance, generateId: genId, setActiveTab, canEdit } = useApp();
  const pf = data.personalFinance;
  const currentMonth = getMonthKey();
  const [expensesUi, setExpensesUi] = useUiSection('expenses');
  const selectedMonth = expensesUi.selectedMonth || currentMonth;
  const setSelectedMonth = (month) => setExpensesUi({ selectedMonth: month });
  const editingCategories = expensesUi.editingCategories;
  const setEditingCategories = (v) => setExpensesUi({ editingCategories: typeof v === 'function' ? v(editingCategories) : v });

  const categoryBaseline = useRef(null);

  const monthOptions = useMemo(() => {
    const keys = new Set([...getPastMonths(12), ...(pf.monthlyRecords || []).map((r) => r.month)]);
    return [...keys].sort().reverse();
  }, [pf.monthlyRecords]);

  const record = useMemo(() => getMonthRecord(pf, selectedMonth), [pf, selectedMonth]);
  const stats = useMemo(() => computeMonthStats(pf, selectedMonth), [pf, selectedMonth]);
  const isCurrentMonth = selectedMonth === currentMonth;

  const prevMonthKey = useMemo(() => getPreviousMonthKey(selectedMonth), [selectedMonth]);
  const prevRecord = useMemo(() => getMonthRecord(pf, prevMonthKey), [pf, prevMonthKey]);
  const prevMonthLabel = useMemo(() => formatMonthLabel(prevMonthKey), [prevMonthKey]);
  const prevMonthHasData = useMemo(() => hasMonthExpenseData(pf, prevMonthKey), [pf, prevMonthKey]);

  const saveRecord = (updated, audit) => {
    updateFinance(upsertMonthRecord(pf, updated), audit);
  };

  const setCategoryAmount = (catId, value) => {
    saveRecord({
      ...record,
      categoryAmounts: { ...record.categoryAmounts, [catId]: value === '' ? '' : value },
    });
  };

  const addExtraExpense = () => {
    saveRecord({
      ...record,
      extraExpenses: [...record.extraExpenses, { id: genId(), name: 'New Expense', amount: '', category: 'other' }],
    }, buildExpenseMonthAudit(selectedMonth, 'added extra expense'));
  };

  const updateExtra = (id, field, value) => {
    saveRecord({
      ...record,
      extraExpenses: record.extraExpenses.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    });
  };

  const removeExtra = (id) => {
    const name = record.extraExpenses.find((e) => e.id === id)?.name || 'expense';
    saveRecord(
      { ...record, extraExpenses: record.extraExpenses.filter((e) => e.id !== id) },
      buildExpenseMonthAudit(selectedMonth, `removed ${name}`),
    );
  };

  const categories = pf.expenseCategories?.length ? pf.expenseCategories : DEFAULT_EXPENSE_CATEGORIES;

  const finishCategoryEdit = () => {
    const baseline = categoryBaseline.current;
    categoryBaseline.current = null;
    if (baseline) {
      const changed = categories.filter((cat) => {
        const before = baseline[cat.id] ?? '';
        const after = record.categoryAmounts?.[cat.id] ?? '';
        return String(before) !== String(after);
      });
      if (changed.length > 0) {
        const detail = changed.length === 1
          ? changed[0].name
          : `${changed.length} categories (${changed.slice(0, 2).map((c) => c.name).join(', ')}${changed.length > 2 ? '…' : ''})`;
        saveRecord(record, buildExpenseMonthAudit(selectedMonth, detail));
        setEditingCategories(false);
        return;
      }
    }
    setEditingCategories(false);
  };

  const startCategoryEdit = () => {
    categoryBaseline.current = { ...record.categoryAmounts };
    setEditingCategories(true);
  };
  const monthPrepayments = useMemo(() => getPrepaymentsForMonth(pf, selectedMonth), [pf, selectedMonth]);

  const loanPaymentsSub = stats.loanPrepayments > 0
    ? `${formatIndianCurrency(stats.loanEmi)} EMI + ${formatIndianCurrency(stats.loanPrepayments)} prepay`
    : undefined;

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <PageHeader
        title="Monthly Expenses"
        subtitle={canEdit ? "Edit this month's spending — overview updates automatically" : 'Monthly spending breakdown'}
        action={(
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <select value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); setEditingCategories(false); }} className="text-sm flex-1 sm:flex-none min-w-0">
              {monthOptions.map((m) => (
                <option key={m} value={m}>{formatMonthLabel(m)}{m === currentMonth ? ' (Current)' : ''}</option>
              ))}
            </select>
          </div>
        )}
      />

      {canEdit && isCurrentMonth && (
        <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-sm text-indigo-800 dark:text-indigo-200">
          Editing <strong>{formatMonthLabel(currentMonth)}</strong> — changes reflect on the Overview dashboard instantly.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
        <StatCard label="Income" value={formatIndianCurrency(stats.totalIncome)} color="green" />
        <StatCard label="Living Expenses" value={formatIndianCurrency(stats.livingExpenses)} color="red" />
        <StatCard label="Loan EMIs" value={formatIndianCurrency(stats.loanPayments)} sub={loanPaymentsSub} color="amber" />
        <StatCard label="Total Outflow" value={formatIndianCurrency(stats.totalExpenses)} color="red" />
        <StatCard label="Savings" value={formatIndianCurrency(stats.savings)} sub={`${stats.savingsRate.toFixed(1)}% rate`} color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Income — This Month" subtitle="Adjust salaries in Family Income tab">
          <div className="space-y-2">
            {stats.memberIncome.map((m) => (
              <div
                key={m.id}
                className={`flex items-center justify-between p-3 rounded-xl border ${
                  m.status !== 'normal'
                    ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
                    : 'border-slate-100 dark:border-slate-800'
                }`}
              >
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-slate-500">{m.relationship}</p>
                </div>
                <div className="text-right">
                  {m.status === 'skipped' && <PauseCircle className="w-4 h-4 text-amber-500 inline mr-1" />}
                  {m.status !== 'normal' && (
                    <p className="text-xs text-slate-400 line-through">{formatIndianCurrency(m.monthlyIncome, false)}</p>
                  )}
                  <p className="font-bold text-emerald-600">{formatIndianCurrency(m.effectiveIncome, false)}</p>
                </div>
              </div>
            ))}
            <div className="flex justify-between p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-sm">
              <span>Other income</span>
              <span className="font-bold text-blue-600">{formatIndianCurrency(stats.otherIncome, false)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800 font-semibold">
              <span>Total Income</span>
              <span className="text-emerald-600">{formatIndianCurrency(stats.totalIncome, false)}</span>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => setActiveTab('family')}
                className="w-full mt-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
              >
                Edit income / skip salary → Family Income tab
              </button>
            )}
          </div>
        </Card>

        <Card title="Loan & Car Payments" subtitle="EMIs + prepayments this month (from Loans tab)">
          <div className="space-y-2">
            {(pf.loans || []).map((loan) => {
              const ls = computeLoanStats(loan);
              if (ls.isClosed) return null;
              const loanPrepayments = monthPrepayments.filter((p) => p.loanId === loan.id);
              return (
                <div key={loan.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      {loan.loanType === 'car' ? <Car className="w-4 h-4 text-cyan-500" /> : <CreditCard className="w-4 h-4 text-indigo-500" />}
                      <div>
                        <p className="text-sm font-medium">{loan.name}</p>
                        <p className="text-[10px] text-slate-500">{loan.lender}</p>
                      </div>
                    </div>
                    <span className="font-bold text-red-500">{formatIndianCurrency(ls.emi, false)}/mo EMI</span>
                  </div>
                  {loanPrepayments.map((p) => (
                    <div key={p.id} className="flex justify-between items-center pl-6 py-1.5 border-l-2 border-teal-300 dark:border-teal-700">
                      <div className="flex items-center gap-2">
                        <ArrowDownCircle className="w-3.5 h-3.5 text-teal-600" />
                        <div>
                          <p className="text-xs font-medium text-teal-700 dark:text-teal-300">Prepayment · {p.date}</p>
                          <p className="text-[10px] text-slate-500">Counted in Loan EMIs</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-teal-600">{formatIndianCurrency(p.amount, false)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="flex justify-between pt-2 font-semibold text-sm border-t border-slate-100 dark:border-slate-800">
              <span>Total loan payments</span>
              <span className="text-red-500">{formatIndianCurrency(stats.loanPayments, false)}</span>
            </div>
            {stats.loanPrepayments > 0 && (
              <div className="flex justify-between text-xs text-slate-500">
                <span>EMI + prepayments</span>
                <span>{formatIndianCurrency(stats.loanEmi, false)} + {formatIndianCurrency(stats.loanPrepayments, false)}</span>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card
        title="Expense Categories"
        subtitle={editingCategories && canEdit ? `${formatMonthLabel(selectedMonth)} — edit amounts` : `${formatMonthLabel(selectedMonth)} — spending breakdown`}
        action={canEdit ? (
          editingCategories ? (
            <Btn size="sm" onClick={finishCategoryEdit}><Check className="w-3.5 h-3.5 inline mr-1" />Done</Btn>
          ) : (
            <Btn size="sm" variant="secondary" onClick={startCategoryEdit}><Pencil className="w-3.5 h-3.5 inline mr-1" />Edit</Btn>
          )
        ) : null}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {categories.map((cat) => {
            const amt = toNum(record.categoryAmounts?.[cat.id]);
            const pct = stats.livingExpenses > 0 ? (amt / stats.livingExpenses) * 100 : 0;
            const prevAmt = toNum(prevRecord.categoryAmounts?.[cat.id]);
            const showCompare = !editingCategories && prevMonthHasData;
            const comparePct = prevAmt > 0 ? ((amt - prevAmt) / prevAmt) * 100 : (amt > 0 ? 100 : 0);
            const compareBarMax = Math.max(amt, prevAmt, 1);
            const currentBarPct = (amt / compareBarMax) * 100;
            const prevBarPct = (prevAmt / compareBarMax) * 100;
            const isUp = amt > prevAmt;
            const isDown = amt < prevAmt;

            return (
              <div key={cat.id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-sm font-medium flex-1 min-w-0 truncate">{cat.name}</span>
                  {!editingCategories && (
                    <span className="text-sm font-bold text-red-500 shrink-0">{formatIndianCurrency(amt, false)}</span>
                  )}
                  <span className="text-xs text-slate-400 shrink-0">{pct.toFixed(0)}%</span>
                </div>

                {canEdit && editingCategories ? (
                  <InputField type="number" value={record.categoryAmounts?.[cat.id] ?? ''} onChange={(v) => setCategoryAmount(cat.id, v)} suffix="₹" />
                ) : (
                  <>
                    <ProgressBar value={pct} color={cat.color} height="h-1.5" />
                    {showCompare && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                          <span>vs {prevMonthLabel}</span>
                          <span className={`font-medium flex items-center gap-0.5 ${isUp ? 'text-red-500' : isDown ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {isUp && <TrendingUp className="w-3 h-3" />}
                            {isDown && <TrendingDown className="w-3 h-3" />}
                            {prevAmt > 0 ? `${comparePct >= 0 ? '+' : ''}${comparePct.toFixed(0)}%` : (amt > 0 ? 'new' : '—')}
                            {' · '}{formatIndianCurrency(prevAmt, false)}
                          </span>
                        </div>
                        <div className="relative h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="absolute top-0 left-0 h-full rounded-full opacity-40"
                            style={{ width: `${prevBarPct}%`, backgroundColor: cat.color }}
                            title={`Last month: ${formatIndianCurrency(prevAmt, false)}`}
                          />
                          <div
                            className="absolute top-0 left-0 h-full rounded-full"
                            style={{ width: `${currentBarPct}%`, backgroundColor: cat.color }}
                            title={`This month: ${formatIndianCurrency(amt, false)}`}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                          <span>This month</span>
                          <span>Last month</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        {!editingCategories && !prevMonthHasData && (
          <p className="text-xs text-slate-400 text-center mt-3">No last month data — comparison appears once {prevMonthLabel} is recorded</p>
        )}
      </Card>

      {(canEdit || record.extraExpenses.length > 0) && (
        <Card
          title="One-off / Extra Expenses"
          subtitle="Irregular items outside your monthly categories (repairs, gifts, etc.)"
          action={canEdit ? (
            <Btn size="sm" onClick={addExtraExpense}><Plus className="w-3 h-3 inline mr-1" />Add</Btn>
          ) : null}
        >
          {record.extraExpenses.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">No extra expenses this month</p>
          ) : canEdit ? (
            <div className="space-y-2">
              {record.extraExpenses.map((ex) => (
                <div key={ex.id} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                  <InputField label="Description" value={ex.name} onChange={(v) => updateExtra(ex.id, 'name', v)} />
                  <InputField label="Amount" type="number" value={ex.amount ?? ''} onChange={(v) => updateExtra(ex.id, 'amount', v)} suffix="₹" />
                  <Btn variant="danger" size="sm" onClick={() => removeExtra(ex.id)}><Trash2 className="w-4 h-4" /></Btn>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {record.extraExpenses.map((ex) => (
                <div key={ex.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="text-sm font-medium">{ex.name}</span>
                  <span className="text-sm font-bold text-red-500">{formatIndianCurrency(ex.amount, false)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card title="Month Summary">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
            <IndianRupee className="w-5 h-5 mx-auto text-emerald-600 mb-1" />
            <p className="text-xs text-slate-500">Income</p>
            <p className="font-bold text-emerald-600">{formatIndianCurrency(stats.totalIncome)}</p>
          </div>
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20">
            <TrendingDown className="w-5 h-5 mx-auto text-red-500 mb-1" />
            <p className="text-xs text-slate-500">Expenses + Loans</p>
            <p className="font-bold text-red-500">{formatIndianCurrency(stats.totalExpenses)}</p>
          </div>
          <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
            <p className="text-xs text-slate-500">Net Worth</p>
            <p className="font-bold text-indigo-600">{formatIndianCurrency(stats.netWorth)}</p>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
            <p className="text-xs text-slate-500">Saved</p>
            <p className={`font-bold ${stats.savings >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{formatIndianCurrency(stats.savings)}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
