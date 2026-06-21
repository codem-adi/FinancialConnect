import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export function CalculatingOverlay({ isCalculating, steps, title = 'Calculating…', children }) {
  const [stepIndex, setStepIndex] = useState(0);
  const list = steps?.length ? steps : ['Crunching numbers…'];

  useEffect(() => {
    if (!isCalculating) {
      setStepIndex(0);
      return undefined;
    }
    const id = setInterval(() => {
      setStepIndex((i) => (i + 1) % list.length);
    }, 520);
    return () => clearInterval(id);
  }, [isCalculating, list.length]);

  return (
    <div className="relative">
      {isCalculating && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/85 dark:bg-slate-950/90 backdrop-blur-sm border border-indigo-100 dark:border-indigo-900/50 animate-fade-in min-h-[280px]">
          <div className="text-center px-6 py-8 max-w-sm">
            <div className="relative mx-auto w-14 h-14 mb-4">
              <div className="absolute inset-0 rounded-full border-2 border-indigo-200 dark:border-indigo-800" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-600 animate-spin" />
              <Loader2 className="absolute inset-0 m-auto w-6 h-6 text-indigo-600 animate-pulse" />
            </div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{title}</p>
            <p className="text-sm text-indigo-600 dark:text-indigo-400 mt-2 min-h-[1.25rem] transition-opacity">
              {list[stepIndex]}
            </p>
            <div className="flex justify-center gap-1 mt-4">
              {list.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === stepIndex ? 'w-6 bg-indigo-600' : 'w-1.5 bg-slate-300 dark:bg-slate-600'}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
      <div
        className={`space-y-4 transition-all duration-300 ${isCalculating ? 'opacity-30 blur-[2px] pointer-events-none select-none' : 'opacity-100'}`}
        aria-hidden={isCalculating}
      >
        {children}
      </div>
    </div>
  );
}
