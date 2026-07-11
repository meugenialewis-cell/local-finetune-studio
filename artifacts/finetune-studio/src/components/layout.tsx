import { Link, useLocation } from "wouter";
import { Activity, Beaker, History, MessageSquare, Settings, Cpu } from "lucide-react";
import { useGetSystemStatus } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: systemStatus } = useGetSystemStatus();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary">
            <Beaker className="w-5 h-5" />
          </div>
          <span className="font-medium text-sm tracking-wide">Fine-Tune Studio</span>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <Link
            href="/"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
              location === "/" ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <Activity className="w-4 h-4" />
            New Training Run
          </Link>
          <Link
            href="/chat"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
              location === "/chat" ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Chat
          </Link>
          <Link
            href="/history"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
              location === "/history" ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <History className="w-4 h-4" />
            Job History
          </Link>
          <Link
            href="/settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
              location === "/settings" ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </Link>
        </nav>

        <div className="p-4 border-t border-border">
          <div className="bg-card rounded-lg p-3 text-xs border border-card-border flex flex-col gap-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Cpu className="w-4 h-4" />
              <span>System Status</span>
            </div>
            {systemStatus ? (
              <div>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className={`w-2 h-2 rounded-full ${systemStatus.trainingBackendReady ? "bg-green-500" : "bg-yellow-500"}`} />
                  <span className="font-medium">{systemStatus.trainingBackendReady ? "Ready for Training" : "Simulation Mode"}</span>
                </div>
                <div className="text-muted-foreground mt-1 opacity-80 leading-tight">
                  {systemStatus.message}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground animate-pulse">Checking status...</div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
