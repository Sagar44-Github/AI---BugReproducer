import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import { NotificationsProvider } from "@/contexts/notifications";

import { LandingPage } from "@/pages/landing";
import { Dashboard } from "@/pages/dashboard";
import { History } from "@/pages/history";
import { NewAnalysis } from "@/pages/new";
import { AnalysisDetail } from "@/pages/detail";
import { ExportPage } from "@/pages/export";
import { Settings } from "@/pages/settings";
import { EnvDiffPage } from "@/pages/env-diff";
import { Nl2TestPage } from "@/pages/nl2test";
import { FlakyDetectorPage } from "@/pages/flaky-detector";
import { ProjectsPage } from "@/pages/projects";
import { RegressionGuardPage } from "@/pages/regression-guard";
import { BugDigestPage } from "@/pages/bug-digest";
import { DocsPage } from "@/pages/docs";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/history" component={History} />
      <Route path="/new" component={NewAnalysis} />
      <Route path="/analyses/:id/export" component={ExportPage} />
      <Route path="/analyses/:id" component={AnalysisDetail} />
      <Route path="/settings" component={Settings} />
      <Route path="/tools/env-diff" component={EnvDiffPage} />
      <Route path="/tools/nl2test" component={Nl2TestPage} />
      <Route path="/tools/flaky-detector" component={FlakyDetectorPage} />
      <Route path="/tools/regression-guard" component={RegressionGuardPage} />
      <Route path="/tools/bug-digest" component={BugDigestPage} />
      <Route path="/projects" component={ProjectsPage} />
      <Route path="/docs" component={DocsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <NotificationsProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppLayout>
              <Router />
            </AppLayout>
          </WouterRouter>
        </NotificationsProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
