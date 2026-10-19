"use client";

/**
 * One read of chain state, keyed. State is set only when the read answers
 * (never synchronously inside the effect), "loading" is derived from the
 * key, and `reload()` reads again bypassing the short cache. Every sheet
 * also reloads when any transaction in this tab finalizes.
 */
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

export interface ChainRead<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

export function useChain<T>(key: string | null, fetcher: (fresh: boolean) => Promise<T>): ChainRead<T> {
  const [state, setState] = useState<{ key: string; tick: number; data?: T; error?: unknown }>({ key: "", tick: -1 });
  const [tick, setTick] = useState(0);
  const fresh = useRef(false);
  const run = useEffectEvent((f: boolean) => fetcher(f));

  useEffect(() => {
    if (key === null) return;
    let alive = true;
    const f = fresh.current;
    fresh.current = false;
    run(f).then(
      (data) => { if (alive) setState({ key, tick, data }); },
      (error: unknown) => { if (alive) setState({ key, tick, error }); },
    );
    return () => { alive = false; };
  }, [key, tick]);

  const reload = useCallback(() => {
    fresh.current = true;
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const h = () => reload();
    window.addEventListener("harvestshield:changed", h);
    return () => window.removeEventListener("harvestshield:changed", h);
  }, [reload]);

  const current = key !== null && state.key === key;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: key !== null && (!current || (state.data === undefined && state.error === undefined)),
    reload,
  };
}
