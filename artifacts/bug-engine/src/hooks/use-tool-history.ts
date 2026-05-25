import { useState } from "react";

export type ToolHistoryEntry<T> = {
  id: string;
  createdAt: string;
  label: string;
  result: T;
};

export function useToolHistory<T>(toolKey: string, maxEntries = 15) {
  const storageKey = `toolHistory_${toolKey}`;

  const [history, setHistory] = useState<ToolHistoryEntry<T>[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as ToolHistoryEntry<T>[];
    } catch {
      return [];
    }
  });

  const addEntry = (label: string, result: T) => {
    const entry: ToolHistoryEntry<T> = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      label,
      result,
    };
    const updated = [entry, ...history].slice(0, maxEntries);
    setHistory(updated);
    try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch {}
  };

  const clearHistory = () => {
    setHistory([]);
    try { localStorage.removeItem(storageKey); } catch {}
  };

  return { history, addEntry, clearHistory };
}
