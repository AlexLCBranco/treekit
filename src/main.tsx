import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { initAutoSave } from "./store/autoSave";
import "./styles/global.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

initAutoSave();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
