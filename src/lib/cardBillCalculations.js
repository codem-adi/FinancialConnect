import { getMonthKey } from './financeStats';
import { formatIndianCurrency, toNum } from './utils';

/** Supports legacy `memberCars` / `carName` fields from earlier builds. */
export function normalizeMemberCards(pf) {
  const raw = pf?.memberCards ?? pf?.memberCars ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    ...item,
    cardName: item.cardName || item.carName || '',
    sendReminder: item.sendReminder !== false,
  }));
}

/** Bill amount for a card in a given month (falls back to legacy card.estimatedAmount). */
export function getCardBillAmount(record, cardId, card) {
  const stored = record?.cardBillAmounts?.[cardId];
  if (stored !== undefined && stored !== null && stored !== '') return toNum(stored);
  return toNum(card?.estimatedAmount);
}

export function sumCardBillAmounts(record, cards) {
  return (cards || []).reduce((sum, card) => sum + getCardBillAmount(record, card.id, card), 0);
}

export function dayInMonth(year, monthIndex, day) {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(Math.max(1, toNum(day) || 1), last);
}

export function daysUntil(targetDay, today = new Date()) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const clamped = dayInMonth(year, month, targetDay);
  const target = new Date(year, month, clamped);
  const start = new Date(year, month, today.getDate());
  const diff = Math.round((target - start) / (24 * 60 * 60 * 1000));
  if (diff >= 0) return diff;
  const nextMonth = new Date(year, month + 1, dayInMonth(year, month + 1, targetDay));
  return Math.round((nextMonth - start) / (24 * 60 * 60 * 1000));
}

export function isBillGenerateDay(card, today = new Date()) {
  return today.getDate() === dayInMonth(today.getFullYear(), today.getMonth(), card.billGenerateDay);
}

export function isBillDueDay(card, today = new Date()) {
  return today.getDate() === dayInMonth(today.getFullYear(), today.getMonth(), card.billDueDay);
}

/** Days since the most recent bill generate date (0 = generate day, 1 = day after, etc.). */
export function daysSinceBillGenerate(card, today = new Date()) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const start = new Date(year, month, today.getDate());
  const thisMonthGen = new Date(year, month, dayInMonth(year, month, card.billGenerateDay));
  let diff = Math.round((start - thisMonthGen) / (24 * 60 * 60 * 1000));
  if (diff < 0) {
    const prev = new Date(year, month - 1, dayInMonth(year, month - 1, card.billGenerateDay));
    diff = Math.round((start - prev) / (24 * 60 * 60 * 1000));
  }
  return diff;
}

export function isDayAfterBillGenerate(card, today = new Date()) {
  return daysSinceBillGenerate(card, today) === 1;
}

export function isDayBeforeBillDue(card, today = new Date()) {
  return daysUntil(card.billDueDay, today) === 1;
}

export function getCardBillAlerts(cards, pf, today = new Date()) {
  const list = normalizeMemberCards({ memberCards: cards });
  const monthKey = getMonthKey(today);
  const record = pf?.monthlyRecords
    ? (pf.monthlyRecords.find((r) => r.month === monthKey) || { cardBillAmounts: {} })
    : { cardBillAmounts: {} };
  const alerts = [];

  for (const card of list) {
    const memberLabel = card.memberName || 'Member';
    const cardLabel = card.cardName || 'Card';
    const provider = card.billProvider || 'Bill';
    const amount = getCardBillAmount(record, card.id, card);

    if (isDayAfterBillGenerate(card, today)) {
      const needsAmount = amount <= 0;
      alerts.push({
        id: `${card.id}-amount-${monthKey}`,
        type: 'amount_request',
        severity: needsAmount ? 'warning' : 'info',
        card,
        title: needsAmount ? 'Enter this month\'s bill amount' : 'Confirm bill amount',
        message: needsAmount
          ? `${provider} bill for ${memberLabel}'s ${cardLabel} was generated yesterday — add the amount in Expenses.`
          : `${provider} bill for ${memberLabel}'s ${cardLabel}: ${formatIndianCurrency(amount, false)} saved — update in Expenses if needed.`,
      });
    }

    if (isDayBeforeBillDue(card, today)) {
      alerts.push({
        id: `${card.id}-due-soon-${monthKey}`,
        type: 'due_soon',
        severity: 'warning',
        card,
        title: 'Bill due tomorrow',
        message: `${provider} payment for ${memberLabel}'s ${cardLabel} is due tomorrow${amount ? ` · ${formatIndianCurrency(amount, false)}` : ' — enter the bill amount in Expenses'}.`,
      });
    } else if (isBillDueDay(card, today)) {
      alerts.push({
        id: `${card.id}-due-${monthKey}`,
        type: 'due',
        severity: 'urgent',
        card,
        title: 'Bill due today',
        message: `${provider} payment due today for ${memberLabel}'s ${cardLabel}${amount ? ` · ${formatIndianCurrency(amount, false)}` : ''}.`,
      });
    } else {
      const dueIn = daysUntil(card.billDueDay, today);
      if (dueIn > 1 && dueIn <= 3) {
      alerts.push({
        id: `${card.id}-soon-${monthKey}`,
        type: 'due_soon',
        severity: 'warning',
        card,
        title: `Bill due in ${dueIn} day${dueIn === 1 ? '' : 's'}`,
        message: `${provider} for ${memberLabel}'s ${cardLabel} is due on day ${card.billDueDay}${amount ? ` · ${formatIndianCurrency(amount, false)}` : ''}.`,
      });
      }
    }
  }

  return alerts.sort((a, b) => {
    const order = { urgent: 0, warning: 1, info: 2 };
    return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
  });
}

export function createEmptyCard(member, memberSource = 'family') {
  return {
    id: '',
    memberSource,
    memberId: member?.id || '',
    memberName: member?.name || '',
    cardName: '',
    cardLast4: '',
    billProvider: '',
    billGenerateDay: 1,
    billDueDay: 10,
    notifyEmail: member?.email || '',
    sendReminder: true,
    lastAmountRequestReminderMonth: null,
    lastDueSoonReminderMonth: null,
    lastGenerateReminderMonth: null,
    lastDueReminderMonth: null,
  };
}
