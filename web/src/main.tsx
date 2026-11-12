import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AccountProvider } from "./providers/account-provider";
import { HomeRadarProvider } from "./providers/home-radar-provider";
import "maplibre-gl/dist/maplibre-gl.css";
import "./theme.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AccountProvider>
      <HomeRadarProvider><App /></HomeRadarProvider>
    </AccountProvider>
  </StrictMode>,
);
