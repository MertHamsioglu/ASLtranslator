/**
 * OWNER: Mert — Vite entry for /train.html.
 * Mount only; the page itself lives in pages/TrainPage.jsx so fast refresh works.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import TrainPage from "./pages/TrainPage";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <TrainPage />
  </StrictMode>,
);
