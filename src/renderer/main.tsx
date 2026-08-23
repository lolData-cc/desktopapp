import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { installDevShell } from "./devShell"
import "./index.css"

// No-op inside Electron, where the preload already provided the bridge.
installDevShell()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
