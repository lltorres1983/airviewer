import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./app-router";
import { AccountProvider } from "./providers/account-provider";
import { HomeRadarProvider } from "./providers/home-radar-provider";
import "maplibre-gl/dist/maplibre-gl.css";
import "./theme.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AccountProvider>
      <HomeRadarProvider><AppRouter /></HomeRadarProvider>
    </AccountProvider>
  </StrictMode>,
);
