import type { ReactNode } from "react";

import { ArLabPage } from "./poc/ar-lab/ArLabPage";
import { SalesLabPage } from "./poc/sales-lab/SalesLabPage";
import { DemoPage } from "./pages/DemoPage";
import { RegisterFacePage } from "./pages/RegisterFacePage";
import { ServiceHealthBanner } from "./components/ServiceHealthBanner";


function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <ServiceHealthBanner />
      {children}
    </>
  );
}

export function App() {
  if (window.location.pathname.startsWith("/poc/ar-lab")) {
    return (
      <AppShell>
        <ArLabPage />
      </AppShell>
    );
  }

  if (window.location.pathname.startsWith("/poc/sales-lab")) {
    return (
      <AppShell>
        <SalesLabPage />
      </AppShell>
    );
  }

  if (window.location.pathname === "/register-face") {
    return (
      <AppShell>
        <RegisterFacePage />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <DemoPage />
    </AppShell>
  );
}
