import { useEffect, useRef, useState } from "react";

/**
 * Animate a number from 0 → target over `duration` ms with ease-out.
 * Returns the formatted current value (no decimal places by default).
 */
export function useCountUp(target: number, duration = 900, decimals = 0) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setValue(0);
      return;
    }
    startRef.current = null;
    const from = 0;
    const to = target;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString();
}
