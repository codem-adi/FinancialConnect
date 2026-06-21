import { useEffect, useState } from 'react';

const POLL_MS = 2000;

export function useApiHealth() {
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    let cancelled = false;
    let timer;

    const check = async () => {
      try {
        const res = await fetch('/api/health');
        if (cancelled) return;
        if (res.ok) {
          setStatus('ok');
          return;
        }
        setStatus('waiting');
      } catch {
        if (!cancelled) setStatus('waiting');
      }
      if (!cancelled) timer = setTimeout(check, POLL_MS);
    };

    check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return status;
}
