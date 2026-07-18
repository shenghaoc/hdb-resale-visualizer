import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import App from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initErrorReporting } from "@/shared/lib/errorReporter";
import { I18nProvider } from "@/shared/lib/i18n";
import { initPerformanceReporting } from "@/shared/lib/performance";
import "./styles.css";

initErrorReporting();
initPerformanceReporting();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </I18nProvider>
  </React.StrictMode>,
);
