import { type ReactNode } from "react";

import { DemoPage } from "./pages/DemoPage";
import { ServiceHealthBanner } from "./components/ServiceHealthBanner";
import { I18nProvider } from "./i18n/I18nProvider";

function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <ServiceHealthBanner />
      {children}
    </>
  );
}

export function App() {
  return (
    <I18nProvider>
      <AppShell>
        <DemoPage />
      </AppShell>
    </I18nProvider>
  );
}
