/**
 * OWNER: Mert — Vite entry for /import.html.
 * Mount only; the page itself lives in pages/ImportPage.jsx so fast refresh works.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./pages/tools.css";
import ImportPage from "./pages/ImportPage";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ImportPage />
  </StrictMode>,
);
