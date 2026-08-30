import { toast } from "sonner"
import { CyberToast } from "@/ui/cyber-toast"

type ShowCyberToastOptions = {
  title: string
  description?: string
  tag?: string
  variant?: "status" | "error"
  duration?: number
  action?: { label: string; onClick: () => void }
  closeButton?: boolean
  /** Stable id — passing the same id makes a new toast REPLACE the
   *  previous one (Sonner dedupes by id). Use for events that repeat,
   *  e.g. auto-refresh tickers, so they don't pile up. */
  id?: string | number
}

export function showCyberToast({
  title,
  description,
  tag,
  variant = "status",
  duration = 3000,
  action,
  closeButton = false,
  id,
}: ShowCyberToastOptions) {
  toast.custom(
    (toastId) => (
      <CyberToast
        title={title}
        description={description}
        tag={tag}
        variant={variant}
        // The progress line runs for as long as the toast actually lives; it
        // used to be fixed at 3s while callers pass 2s to 8s.
        duration={duration}
        action={action ? {
          label: action.label,
          onClick: () => { action.onClick(); toast.dismiss(toastId); },
        } : undefined}
        onDismiss={closeButton ? () => toast.dismiss(toastId) : undefined}
      />
    ),
    { duration, ...(id !== undefined && { id }) },
  )
}
