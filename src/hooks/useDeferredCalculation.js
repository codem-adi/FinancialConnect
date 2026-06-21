import { useEffect, useRef, useState } from 'react';

export function useDeferredCalculation(depsKey, compute, options = {}) {
  const {
    debounceMs = 400,
    minDisplayMs = 700,
  } = options;

  const computeRef = useRef(compute);
  computeRef.current = compute;

  const isFirstRun = useRef(true);
  const [result, setResult] = useState(() => computeRef.current());
  const [isCalculating, setIsCalculating] = useState(false);
  const timersRef = useRef([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      setResult(computeRef.current());
      return undefined;
    }

    clearTimers();
    setIsCalculating(true);

    const debounceId = setTimeout(() => {
      const started = Date.now();
      const next = computeRef.current();
      const wait = Math.max(0, minDisplayMs - (Date.now() - started));

      const revealId = setTimeout(() => {
        setResult(next);
        setIsCalculating(false);
      }, wait);
      timersRef.current.push(revealId);
    }, debounceMs);

    timersRef.current.push(debounceId);
    return clearTimers;
  }, [depsKey, debounceMs, minDisplayMs]);

  return { result, isCalculating };
}
