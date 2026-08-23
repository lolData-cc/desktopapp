import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import Overlay from "./Overlay"
import { installDevShell } from "./devShell"
import "./index.css"

// No-op inside Electron, where the preload already provided the bridge.
installDevShell()

// One bundle, two surfaces. The overlay window loads the same URL with a flag
// rather than a second build entry — one Vite server, one dev loop.
const isOverlay = new URLSearchParams(location.search).has("overlay")

if (isOverlay) document.body.style.background = "transparent"

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isOverlay ? <Overlay /> : <App />}</StrictMode>
)
