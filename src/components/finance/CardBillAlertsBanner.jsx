import { AlertTriangle, Bell, CreditCard, FileText } from 'lucide-react';
import { getCardBillAlerts } from '../../lib/cardBillCalculations';

const STYLE = {
  urgent: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200',
  warning: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100',
  info: 'border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-900 dark:text-cyan-100',
};

const ICON = {
  urgent: AlertTriangle,
  warning: Bell,
  info: FileText,
};

export function CardBillAlertsBanner({ cards, pf, compact = false }) {
  const alerts = getCardBillAlerts(cards || [], pf);
  if (!alerts.length) return null;

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {alerts.map((alert) => {
        const Icon = ICON[alert.severity] || CreditCard;
        return (
          <div
            key={alert.id}
            className={`flex gap-3 p-3 rounded-xl border ${STYLE[alert.severity] || STYLE.info}`}
          >
            <Icon className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{alert.title}</p>
              <p className="text-sm opacity-90">{alert.message}</p>
              {(alert.card.notifyEmail || alert.card.sendReminder === false) && (
                <p className="text-xs opacity-75 mt-1">
                  {alert.card.sendReminder === false
                    ? 'Card owner email reminders off · group owner still notified'
                    : `Reminder email: ${alert.card.notifyEmail}`}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
