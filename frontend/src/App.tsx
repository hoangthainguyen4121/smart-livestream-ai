import { DemoPage } from "./pages/DemoPage";
import { RegisterFacePage } from "./pages/RegisterFacePage";


export function App() {
  if (window.location.pathname === "/register-face") {
    return <RegisterFacePage />;
  }

  return <DemoPage />;
}
