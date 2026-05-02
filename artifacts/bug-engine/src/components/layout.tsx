import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Bug, LayoutDashboard, PlusCircle, History, Settings,
  GitCompare, FlaskConical, Shuffle, ChevronDown
} from "lucide-react";

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/new", label: "New Analysis", icon: PlusCircle },
  { href: "/history", label: "History", icon: History },
];

const toolsNav = [
  { href: "/tools/env-diff", label: "Env Diff", icon: GitCompare },
  { href: "/tools/nl2test", label: "NL2Test", icon: FlaskConical },
  { href: "/tools/flaky-detector", label: "Flaky Detector", icon: Shuffle },
];

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
                <div
                  className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg py-1 z-50"
                  onBlur={() => setToolsOpen(false)}
                >
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
