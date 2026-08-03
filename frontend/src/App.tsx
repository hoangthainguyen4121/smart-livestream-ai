import { type ReactNode } from "react";

import { DemoPage } from "./pages/DemoPage";
import { IntentCorrectionAdminPage } from "./pages/IntentCorrectionAdminPage";
import { ServiceHealthBanner } from "./components/ServiceHealthBanner";
import { I18nProvider } from "./i18n/I18nProvider";
import { isAdminRoute } from "./features/intent-correction-admin/adminAccess";

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
        {isAdminRoute() ? <IntentCorrectionAdminPage /> : <DemoPage />}
      </AppShell>
    </I18nProvider>
  );
}
