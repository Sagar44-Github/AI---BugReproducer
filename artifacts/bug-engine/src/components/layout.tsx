import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Bug, LayoutDashboard, PlusCircle, History, Settings,
  GitCompare, FlaskConical, Shuffle, ChevronDown,
  Bell, CheckCheck, Trash2, BugPlay, XCircle,
  FolderKanban, ShieldCheck, BookOpen
} from "lucide-react";
import { useNotifications } from "@/contexts/notifications";
import { format } from "date-fns";

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/new", label: "New Analysis", icon: PlusCircle },
  { href: "/history", label: "History", icon: History },
  { href: "/projects", label: "Projects", icon: FolderKanban },
];

const toolsNav = [
  { href: "/tools/env-diff", label: "Env Diff", icon: GitCompare },
  { href: "/tools/nl2test", label: "NL2Test", icon: FlaskConical },
  { href: "/tools/flaky-detector", label: "Flaky Detector", icon: Shuffle },
  { href: "/tools/regression-guard", label: "Regression Guard", icon: ShieldCheck },
  { href: "/tools/bug-digest", label: "Bug Digest", icon: BookOpen },
];

function NotificationBell() {
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(v => !v); if (!open && unreadCount > 0) markAllRead(); }}
        className={`relative flex items-center justify-center w-9 h-9 rounded-md transition-colors ${
          open ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`}
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-card border border-border rounded-xl shadow-xl py-2 z-50">
          <div className="flex items-center justify-between px-3 pb-2 border-b border-border/50">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notifications</span>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="py-8 text-center">
              <Bell className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">No notifications yet</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">
                You'll be notified when pipelines finish
              </p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {notifications.map(n => (
                <Link
                  key={n.id}
                  href={`/analyses/${n.analysisId}`}
                  onClick={() => { markRead(n.id); setOpen(false); }}
                  className={`flex items-start gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer ${
                    !n.read ? "bg-primary/5" : ""
                  }`}
                >
                  <div className={`mt-0.5 shrink-0 ${n.type === "pipeline_complete" ? "text-emerald-400" : "text-destructive"}`}>
                    {n.type === "pipeline_complete"
                      ? <CheckCheck className="w-4 h-4" />
                      : <XCircle className="w-4 h-4" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-medium ${n.type === "pipeline_complete" ? "text-emerald-400" : "text-destructive"}`}>
                        {n.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {format(new Date(n.createdAt), "HH:mm")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{n.analysisTitle}</p>
                    <span className="text-[10px] text-primary/70 font-mono mt-0.5 inline-flex items-center gap-1">
                      <BugPlay className="w-2.5 h-2.5" /> View analysis →
                    </span>
                  </div>
                  {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [toolsOpen, setToolsOpen] = useState(false);

  const isToolsActive = toolsNav.some(t => location.startsWith(t.href));

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Bug className="w-5 h-5 text-primary" />
            <span className="font-bold tracking-tight font-mono">BugRepro_Engine</span>
          </Link>
          <nav className="flex items-center gap-1">
            {mainNav.map((item) => {
              const isActive = item.href === "/dashboard" || item.href === "/new" || item.href === "/settings"
                ? location === item.href
                : location.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive ? "text-primary font-medium bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="hidden sm:inline-block">{item.label}</span>
                </Link>
              );
            })}

            {/* Tools dropdown */}
            <div className="relative">
              <button
                onClick={() => setToolsOpen(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isToolsActive ? "text-primary font-medium bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <span className="hidden sm:inline-block">Tools</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${toolsOpen ? "rotate-180" : ""}`} />
              </button>
              {toolsOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg py-1 z-50">
                  {toolsNav.map(tool => (
                    <Link
                      key={tool.href}
                      href={tool.href}
                      onClick={() => setToolsOpen(false)}
                      className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors w-full ${
                        location.startsWith(tool.href) ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <tool.icon className="w-4 h-4" />
                      {tool.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <NotificationBell />

            <Link
              href="/docs"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                location === "/docs" ? "text-primary font-medium bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              title="Documentation"
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline-block">Docs</span>
            </Link>

            <Link
              href="/settings"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                location === "/settings" ? "text-primary font-medium bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline-block">Settings</span>
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
