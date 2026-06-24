import { ArLabPage } from "./poc/ar-lab/ArLabPage";
import { SalesLabPage } from "./poc/sales-lab/SalesLabPage";
import { DemoPage } from "./pages/DemoPage";
import { RegisterFacePage } from "./pages/RegisterFacePage";


export function App() {
  if (window.location.pathname.startsWith("/poc/ar-lab")) {
    return <ArLabPage />;
  }

  if (window.location.pathname.startsWith("/poc/sales-lab")) {
    return <SalesLabPage />;
  }

  if (window.location.pathname === "/register-face") {
    return <RegisterFacePage />;
  }

  return <DemoPage />;
}
