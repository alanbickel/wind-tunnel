// Composition root: the only module allowed to import from every layer.
// It creates the adapters, wires them to the application's ports, and starts
// the UI. See docs/architecture/README.md.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element in index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
