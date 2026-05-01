import { Link } from "wouter";
import { Bug, LayoutDashboard } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-mono">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Bug className="w-5 h-5 text-primary" />
            <span className="font-bold tracking-tight">BugRepro_Engine</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
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
