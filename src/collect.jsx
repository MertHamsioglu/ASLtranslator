/**
 * OWNER: Mert — Vite entry for /collect.html.
 * Mount only; the page itself lives in pages/CollectPage.jsx so fast refresh works.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./pages/tools.css";
import CollectPage from "./pages/CollectPage";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <CollectPage />
  </StrictMode>,
);
