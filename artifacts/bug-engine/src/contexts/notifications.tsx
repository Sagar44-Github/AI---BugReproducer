import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

export type AppNotification = {
  id: string;
  type: "pipeline_complete" | "pipeline_failed";
  title: string;
  analysisId: number;
  analysisTitle: string;
  createdAt: string;
  read: boolean;
};

type NotificationsContextType = {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
  addNotification: (n: Omit<AppNotification, "id" | "createdAt" | "read">) => void;
  /** Call this from the detail page when a pipeline finishes via SSE.
   *  It adds the notification AND pre-updates trackedStatuses so the
   *  30-second polling loop never fires a duplicate. */
  notifyPipelineDone: (analysisId: number, analysisTitle: string, success: boolean) => void;
};

const NotificationsContext = createContext<NotificationsContextType | null>(null);
const STORAGE_KEY = "bugrepro_notifications_v2";
const MAX_NOTIFS = 50;

function load(): AppNotification[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}
function save(notifs: AppNotification[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs)); } catch {}
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(load);
  // id → status of every analysis we've ever seen. Used to detect status transitions.
  const trackedStatuses = useRef<Map<number, string>>(new Map());
  // Whether we've done the initial seed pass (which must NOT emit notifications)
  const seeded = useRef(false);

  const addNotification = useCallback((n: Omit<AppNotification, "id" | "createdAt" | "read">) => {
    setNotifications(prev => {
      const updated = [
        { ...n, id: `${Date.now()}-${Math.random()}`, createdAt: new Date().toISOString(), read: false },
        ...prev,
      ].slice(0, MAX_NOTIFS);
      save(updated);
      return updated;
    });
  }, []);

  // Poll for status transitions (running → completed/failed)
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/analyses`);
        if (!res.ok) return;
        const analyses: { id: number; title: string; status: string }[] = await res.json();

        for (const a of analyses) {
          const prev = trackedStatuses.current.get(a.id);
          if (!seeded.current) {
            // First pass: just record, no notifications
            trackedStatuses.current.set(a.id, a.status);
            continue;
          }
          if (prev === "running" && a.status === "completed") {
            addNotification({ type: "pipeline_complete", title: "Pipeline complete", analysisId: a.id, analysisTitle: a.title });
          } else if (prev === "running" && a.status === "failed") {
            addNotification({ type: "pipeline_failed", title: "Pipeline failed", analysisId: a.id, analysisTitle: a.title });
          }
          trackedStatuses.current.set(a.id, a.status);
        }
        seeded.current = true;
      } catch {}
    };

    poll(); // initial seed
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, [addNotification]);

  /**
   * Called by the detail page when a pipeline finishes via SSE.
   * Pre-updates trackedStatuses so the polling loop cannot fire a duplicate.
   */
  const notifyPipelineDone = useCallback((analysisId: number, analysisTitle: string, success: boolean) => {
    // Immediately stamp the final status so the next poll sees no transition
    trackedStatuses.current.set(analysisId, success ? "completed" : "failed");
    addNotification({
      type: success ? "pipeline_complete" : "pipeline_failed",
      title: success ? "Pipeline complete" : "Pipeline failed",
      analysisId,
      analysisTitle,
    });
  }, [addNotification]);

  const markRead = (id: string) => {
    setNotifications(prev => { const u = prev.map(n => n.id === id ? { ...n, read: true } : n); save(u); return u; });
  };
  const markAllRead = () => {
    setNotifications(prev => { const u = prev.map(n => ({ ...n, read: true })); save(u); return u; });
  };
  const clearAll = () => { setNotifications([]); save([]); };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAllRead, markRead, clearAll, addNotification, notifyPipelineDone }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
