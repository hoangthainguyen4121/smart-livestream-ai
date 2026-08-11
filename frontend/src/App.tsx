import { type ReactNode, lazy, Suspense, useEffect, useState } from "react";

import { DemoPage } from "./pages/DemoPage";
import { IntentCorrectionAdminPage } from "./pages/IntentCorrectionAdminPage";
import { LiveRoomsPage } from "./pages/LiveRoomsPage";
import { ServiceHealthBanner } from "./components/ServiceHealthBanner";
import { I18nProvider } from "./i18n/I18nProvider";
import { parseHashRoute, type AppRoute } from "./routing/hashRoute";

const CvTestVideoPage = import.meta.env.DEV
  ? lazy(async () => {
      const mod = await import("./pages/CvTestVideoPage");
      return { default: mod.CvTestVideoPage };
    })
  : null;

function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <ServiceHealthBanner />
      {children}
    </>
  );
}

function useHashRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() => {
    if (typeof window === "undefined") {
      return { name: "rooms" };
    }
    if (!window.location.hash) {
      window.location.hash = "#/";
    }
    return parseHashRoute(window.location.hash);
  });

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHashRoute(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}

export function App() {
  const route = useHashRoute();

  return (
    <I18nProvider>
      <AppShell>
        {route.name === "admin" ? (
          <IntentCorrectionAdminPage />
        ) : route.name === "live" ? (
          <DemoPage key={route.roomId} roomId={route.roomId} />
        ) : route.name === "cvTest" && CvTestVideoPage ? (
          <Suspense fallback={<main className="cvTestPage">Loading CV test…</main>}>
            <CvTestVideoPage />
          </Suspense>
        ) : (
          <LiveRoomsPage />
        )}
      </AppShell>
    </I18nProvider>
  );
}
