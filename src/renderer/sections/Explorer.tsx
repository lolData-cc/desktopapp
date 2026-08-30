/**
 * The Explorer, brought over from the website.
 *
 * ⚠️ THE CANVAS IS UNCHANGED. Every file under src/renderer/explorer/ is a
 * byte-for-byte copy of the site's, and that is the point: this is ~3,900 lines
 * of graph building, layout and querying, and a port that "tidies it up on the
 * way" is a port that has to be debugged from scratch. Only what the web page
 * around it did is rewritten — and this file is that page.
 *
 * What the site's page did and this does not:
 * - a Navbar. This app has a rail on the left; a second navigation inside a
 *   section would be two ways to leave the same screen.
 * - `useNavigate("/learn")` for the back button. There is no address bar here,
 *   so back means "the section you came from", which the rail already owns.
 * - a page-load fade. Sections in this app arrive through `SectionIn`, and a
 *   second entrance on top of it reads as a stutter rather than as polish.
 *
 * ⚠️ The Toaster is mounted HERE, not in App. The Explorer is the only thing in
 * this app that raises toasts, and a toaster mounted globally for one section
 * is a listener running through every game the app records.
 */
import { Toaster } from "sonner"
import ExplorerCanvas from "@/explorer/ExplorerCanvas"
import "@/explorer/explorer.css"
import "@xyflow/react/dist/style.css"

export default function Explorer({ onBack }: { onBack: () => void }) {
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <ExplorerCanvas onBack={onBack} />

      {/* ⚠️ Bottom-centre, not the site's corner. The site puts this at the top
          right, where this app has the account menu and the window controls,
          and a toast landing on the close button is a toast that gets clicked
          by accident. */}
      <Toaster
        position="bottom-center"
        toastOptions={{ unstyled: true, className: "pointer-events-auto" }}
      />
    </div>
  )
}
