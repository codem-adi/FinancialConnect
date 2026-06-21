import { TrendingUp } from 'lucide-react';

export function BackendLoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="relative w-20 h-20 mx-auto mb-8">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-pulse-soft">
            <TrendingUp className="w-9 h-9 text-white" />
          </div>
          <div className="absolute -inset-2 rounded-3xl border-2 border-indigo-500/40 animate-ring-pulse" />
          <div className="absolute -inset-4 rounded-[1.25rem] border border-purple-500/20 animate-ring-pulse-delayed" />
        </div>

        <h1 className="text-xl font-bold text-white mb-2">RetireWise</h1>
        <p className="text-slate-400 text-sm mb-6">Connecting to server…</p>

        <div className="flex justify-center gap-1.5 mb-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce-dot"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>

        <p className="text-xs text-slate-500">
          {import.meta.env.DEV
            ? <>Waiting for the API. Start the backend with <code className="text-indigo-400">npm run dev</code>.</>
            : 'Waiting for the server. Please try again in a moment.'}
        </p>
      </div>
    </div>
  );
}
