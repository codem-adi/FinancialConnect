import { cn, amountToIndianWords, toNum } from '../../lib/utils';
import { Eye } from 'lucide-react';

export function ViewOnlyBanner() {
  return (
    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
      <Eye className="w-4 h-4 inline mr-1 shrink-0" />
      View-only access — you can browse all data but cannot make changes.
    </div>
  );
}

export function AmountWords({ amount, className }) {
  const words = amountToIndianWords(amount);
  if (!words) return null;
  return <p className={cn('text-xs text-indigo-600 dark:text-indigo-400 italic mt-1', className)}>{words}</p>;
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl sm:text-2xl font-bold leading-tight">{title}</h2>
        {subtitle && (
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5 sm:mt-1 line-clamp-2">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 w-full sm:w-auto">{action}</div>}
    </div>
  );
}

export function Card({ children, className, title, subtitle, action }) {
  return (
    <div className={cn('bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm animate-fade-in', className)}>
      {(title || action) && (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 px-3 pt-3 sm:px-5 sm:pt-5 pb-0">
          <div className="min-w-0 flex-1">
            {title && (
              <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-slate-100 break-words leading-snug">
                {title}
              </h3>
            )}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0 self-start sm:self-center">{action}</div>}
        </div>
      )}
      <div className="p-3 sm:p-5">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, sub, color = 'indigo', trend }) {
  const colors = {
    indigo: 'from-indigo-500 to-purple-600',
    green: 'from-emerald-500 to-teal-600',
    red: 'from-red-500 to-rose-600',
    amber: 'from-amber-500 to-orange-600',
    blue: 'from-blue-500 to-cyan-600',
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-5 animate-fade-in min-w-0">
      <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide truncate">{label}</p>
      <p className={cn('text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 bg-gradient-to-r bg-clip-text text-transparent break-words leading-tight', colors[color])}>{value}</p>
      {sub && <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 line-clamp-2">{sub}</p>}
      {trend && <p className={cn('text-xs mt-1 font-medium', trend > 0 ? 'text-emerald-500' : 'text-red-500')}>{trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%</p>}
    </div>
  );
}

export function ProgressBar({ value, color = '#6366f1', height = 'h-2' }) {
  const pct = Number.isFinite(Number(value)) ? Math.min(100, Math.max(0, Number(value))) : 0;
  return (
    <div className={cn('w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden', height)}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export function InputField({
  label, value, onChange, type = 'text', min, max, step, suffix, className,
  showWords, emptyZero = true, allowDecimal = true, readOnly = false,
}) {
  const isNumber = type === 'number';
  const isCurrency = suffix?.includes('₹') || showWords === true;
  const shouldShowWords = isNumber && (showWords ?? isCurrency);

  const displayValue = (() => {
    if (!isNumber) return value ?? '';
    if (value === '' || value == null) return '';
    if (emptyZero && toNum(value) === 0) return '';
    return String(value);
  })();

  const handleChange = (e) => {
    if (readOnly) return;
    if (!isNumber) {
      onChange(e.target.value);
      return;
    }
    let raw = e.target.value;
    // Allow empty
    if (raw === '') {
      onChange('');
      return;
    }
    // Strip leading zeros (keep "0." for decimals)
    if (allowDecimal) {
      raw = raw.replace(/[^\d.]/g, '');
      const parts = raw.split('.');
      if (parts.length > 2) return;
      if (parts[0].length > 1 && parts[0].startsWith('0') && parts[0] !== '0') {
        parts[0] = parts[0].replace(/^0+/, '') || '0';
      }
      raw = parts.length === 2 ? `${parts[0]}.${parts[1]}` : parts[0];
    } else {
      raw = raw.replace(/\D/g, '');
      if (raw.length > 1 && raw.startsWith('0')) raw = raw.replace(/^0+/, '') || '0';
    }
    if (raw === '' || raw === '.') {
      onChange('');
      return;
    }
    onChange(allowDecimal && raw.includes('.') ? raw : toNum(raw));
  };

  const wordsText = shouldShowWords && displayValue !== ''
    ? amountToIndianWords(displayValue)
    : '';

  return (
    <div className={className}>
      {label && <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>}
      <div className="relative">
        <input
          type={isNumber ? 'text' : type}
          inputMode={isNumber ? (allowDecimal ? 'decimal' : 'numeric') : undefined}
          value={displayValue}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
          readOnly={readOnly}
          disabled={readOnly}
          placeholder={isNumber ? 'Enter amount' : undefined}
          className={readOnly ? 'opacity-80 cursor-default' : undefined}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{suffix}</span>}
      </div>
      {wordsText && <p className="text-xs text-indigo-600 dark:text-indigo-400 italic mt-1 leading-snug">{wordsText}</p>}
    </div>
  );
}

export function Btn({ children, onClick, variant = 'primary', size = 'md', className, disabled, type = 'button' }) {
  const variants = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    secondary: 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    ghost: 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs rounded-lg', md: 'px-4 py-2 text-sm rounded-xl', lg: 'px-6 py-3 text-base rounded-xl' };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn('font-medium disabled:opacity-50', variants[variant], sizes[size], className)}>
      {children}
    </button>
  );
}

export function Badge({ children, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
    green: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  };
  return <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', colors[color])}>{children}</span>;
}

export function ReadinessRing({ score, color }) {
  const ringColors = { green: '#10b981', yellow: '#f59e0b', red: '#ef4444' };
  const c = ringColors[color] || ringColors.red;
  const safeScore = Number.isFinite(Number(score))
    ? Math.min(100, Math.max(0, Math.round(Number(score))))
    : 0;
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (safeScore / 100) * circ;
  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200 dark:text-slate-700" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={c} strokeWidth="8" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color: c }}>{safeScore}</span>
        <span className="text-xs text-slate-500">/ 100</span>
      </div>
    </div>
  );
}

export { ConfirmDialog } from './ConfirmDialog.jsx';
export { OtpResendControl } from './OtpResendControl.jsx';
