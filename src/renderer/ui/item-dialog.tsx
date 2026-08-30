// ItemDialog — the shared item picker, sibling to ChampionDialog / KeystoneDialog.
// Sources the roster from useItems (live item.json, filtered to items currently in
// the game), so it's never stale. Clean cyber dialog: grid of items, live search,
// keyboard nav. Emits the chosen GameItem (id + name + cost).

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/ui/dialog";
import { BorderBeam } from "@/ui/border-beam";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { cdnBaseUrl } from "@/config";
import { useItems, type GameItem } from "@/hooks/useItems";

const COLS = 6; // item names run longer than champion names → fewer columns

export function ItemDialog({
  value = null,
  onSelect,
  onClear,
  open,
  onOpenChange,
  trigger,
  title = "Select item",
}: {
  value?: number | null;
  onSelect: (item: GameItem) => void;
  onClear?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title?: string;
}) {
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlled ? open : internalOpen;
  const setOpen = (o: boolean) => {
    if (!controlled) setInternalOpen(o);
    onOpenChange?.(o);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && !controlled && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="w-full max-w-[600px] bg-transparent shadow-none border-none p-0 [&>button]:hidden">
        {isOpen && (
          <PickerBody
            value={value}
            title={title}
            onPick={(it) => {
              onSelect(it);
              setOpen(false);
            }}
            onClear={onClear ? () => { onClear(); setOpen(false); } : undefined}
            onClose={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({
  value,
  title,
  onPick,
  onClear,
  onClose,
}: {
  value: number | null;
  title: string;
  onPick: (it: GameItem) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const { items, loading } = useItems();
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  useEffect(() => setActive(0), [search]);

  useEffect(() => {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!filtered.length) return;
    const move = (d: number) => {
      e.preventDefault();
      setActive((i) => Math.max(0, Math.min(filtered.length - 1, i + d)));
    };
    if (e.key === "ArrowRight") move(1);
    else if (e.key === "ArrowLeft") move(-1);
    else if (e.key === "ArrowDown") move(COLS);
    else if (e.key === "ArrowUp") move(-COLS);
    else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[active];
      if (it) onPick(it);
    }
  };

  return (
    <div className="relative w-full" onKeyDown={onKeyDown}>
      <div className="relative overflow-hidden rounded-lg border border-hairline/15 bg-black/55 backdrop-blur-2xl saturate-150 shadow-[0_0_0_1px_rgba(0,217,146,0.16),0_18px_50px_rgba(var(--c-shadow),0.65)]">
        <BorderBeam duration={8} size={130} />

        <div className="relative z-10 flex flex-col">
          {/* header */}
          <div className="px-4 pt-4 pb-3 border-b border-hairline/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-1 h-3 bg-jade rounded-full" />
                <span className="text-[11px] font-jetbrains text-flash/50 tracking-[0.2em] uppercase">{title}</span>
              </div>
              <div className="flex items-center gap-2">
                {onClear && (
                  <button
                    type="button"
                    onClick={onClear}
                    className="text-[9px] font-jetbrains uppercase tracking-[0.2em] px-2 py-0.5 border border-hairline/[0.06] rounded-sm text-flash/30 hover:text-jade hover:border-jade/30 hover:bg-jade/5 transition-all cursor-clicker"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="text-flash/35 hover:text-flash transition-colors cursor-clicker"
                  aria-label="Close"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-flash/30" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search item…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-filmlight/[0.03] border border-hairline/[0.07] rounded-sm pl-9 pr-3 py-2 text-[13px] font-jetbrains text-flash placeholder:text-flash/25 focus:outline-none focus:border-jade/35 transition-colors"
              />
              <div
                className={cn(
                  "absolute bottom-0 left-0 h-[1px] bg-jade/50 transition-all duration-300",
                  search.length > 0 ? "w-full" : "w-0"
                )}
              />
            </div>
          </div>

          {/* grid */}
          <div ref={gridRef} className="h-[46vh] max-h-[420px] min-h-[260px] overflow-y-auto overscroll-none p-3 cyber-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-full text-[11px] font-jetbrains text-flash/30 uppercase tracking-[0.2em]">
                Loading items…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <svg width="36" height="36" viewBox="0 0 36 36" className="opacity-20">
                  <polygon points="18,2 32,10 32,26 18,34 4,26 4,10" fill="none" stroke="#00d992" strokeWidth="1" />
                  <line x1="12" y1="12" x2="24" y2="24" stroke="#00d992" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="24" y1="12" x2="12" y2="24" stroke="#00d992" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span className="text-[10px] font-jetbrains text-flash/25 uppercase tracking-[0.2em]">No item found</span>
              </div>
            ) : (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
                {filtered.map((item, i) => {
                  const selected = value === item.id;
                  const isActive = i === active;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-idx={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => onPick(item)}
                      title={item.name}
                      className={cn(
                        "group flex flex-col items-center gap-1.5 py-2 px-1 rounded-[5px] cursor-clicker border transition-all duration-150",
                        selected
                          ? "border-jade/60 bg-jade/15"
                          : isActive
                            ? "border-jade/30 bg-jade/10"
                            : "border-hairline/[0.06] bg-filmlight/[0.02] hover:bg-jade/[0.08] hover:border-jade/30"
                      )}
                    >
                      <div
                        className={cn(
                          "w-11 h-11 rounded-[4px] overflow-hidden border transition-colors duration-150",
                          selected ? "border-jade/50" : isActive ? "border-jade/40" : "border-hairline/10 group-hover:border-jade/40"
                        )}
                      >
                        <img
                          src={`${cdnBaseUrl()}/img/item/${item.id}.png`}
                          alt={item.name}
                          loading="lazy"
                          className={cn(
                            "w-full h-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.16]",
                            isActive && "scale-[1.16]"
                          )}
                          onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-[10px] leading-[1.15] font-chakrapetch font-bold text-center line-clamp-2 max-w-[82px] transition-colors",
                          selected ? "text-jade" : isActive ? "text-jade" : "text-flash/90 group-hover:text-jade"
                        )}
                      >
                        {item.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* footer hint */}
          <div className="px-4 py-2 border-t border-hairline/[0.06] flex items-center justify-between text-[9px] font-jetbrains text-flash/25 uppercase tracking-[0.18em]">
            <span>{filtered.length} items · live</span>
            <span className="hidden sm:inline">↑↓←→ navigate · enter select · esc close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
