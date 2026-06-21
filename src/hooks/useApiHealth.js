import { useEffect, useState } from 'react';
import { appApi } from '../services/endpoints';

const POLL_MS = 2000;

export function useApiHealth() {
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    let cancelled = false;
    let timer;

    const check = async () => {
      try {
        await appApi.health();
        if (cancelled) return;
        setStatus('ok');
        return;
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
