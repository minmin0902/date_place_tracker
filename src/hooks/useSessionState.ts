import { useEffect, useState } from "react";

type Initializer<T> = T | (() => T);

function resolveInitial<T>(initial: Initializer<T>): T {
  return typeof initial === "function" ? (initial as () => T)() : initial;
}

export function useSessionState<T>(key: string, initial: Initializer<T>) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return resolveInitial(initial);
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : resolveInitial(initial);
    } catch {
      return resolveInitial(initial);
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Session persistence is a comfort feature. If storage is full or
      // unavailable, the live state still works normally.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
