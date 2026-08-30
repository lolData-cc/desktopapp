// Pickers.tsx — node dropdowns in the searchdialog visual language: glass
// Radix surfaces, chakrapetch type, jade focus. ExplorerSelect for short
// lists; IconCombobox (Popover + cmdk) for the long, searchable champion/item
// lists with icons. Both portal to <body>, so they never clip inside a node.

import { useState, type ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/ui/command";

export type Opt = { value: string; label: string };
// Optional grouping for ExplorerSelect: an unlabelled section renders flush, a
// labelled one gets a divider + tiny uppercase header.
export type OptGroup = { label?: string; options: Opt[] };

// `explorer-surface` (see explorer.css) nukes stray focus outlines on these
// portaled popups; jade border instead of the base theme's white one.
const GLASS =
  "explorer-surface outline-none !border !border-jade/25 bg-black/90 backdrop-blur-xl saturate-150 " +
  "shadow-[0_16px_44px_rgba(var(--c-shadow),0.7)]";

const triggerBase =
  "nodrag group w-full rounded-[4px] cursor-clicker outline-none focus:outline-none " +
  "focus-visible:outline-none focus-visible:ring-0 flex items-center " +
  "border bg-filmdark/40 backdrop-blur-lg transition-all duration-200";

export function ExplorerSelect({
  value, onChange, options, groups, placeholder = "—", renderIcon,
}: {
  value?: string;
  onChange: (v: string) => void;
  // pass EITHER a flat `options` list OR pre-grouped `groups` (mutually exclusive)
  options?: Opt[];
  groups?: OptGroup[];
  placeholder?: string;
  // optional leading glyph per option (shown in the trigger + each row)
  renderIcon?: (value: string) => ReactNode;
}) {
  // normalise to sections: explicit groups, or one unlabelled section from options
  const sections: OptGroup[] = groups ?? [{ options: options ?? [] }];
  const active = sections.flatMap((s) => s.options).find((o) => o.value === value);
  const activeIcon = renderIcon && active ? renderIcon(active.value) : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          triggerBase, "h-8 px-2.5 gap-1.5 font-chakrapetch text-[11.5px]",
          active ? "text-flash border-jade/30 hover:border-jade/50" : "text-flash/45 border-hairline/10 hover:border-hairline/20"
        )}
      >
        {activeIcon && <span className="shrink-0 grid place-items-center w-[18px] h-[18px]">{activeIcon}</span>}
        <span className="flex-1 text-left truncate">{active?.label ?? placeholder}</span>
        <ChevronDown className="w-3 h-3 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className={cn("min-w-[var(--radix-dropdown-menu-trigger-width)] p-1", GLASS)}
      >
        {sections.map((sec, si) => (
          <div key={si}>
            {si > 0 && <div className="mx-1 my-1 h-px bg-filmlight/[0.07]" />}
            {sec.label && (
              <div className="px-2 pt-1 pb-1 font-chakrapetch text-[8.5px] font-bold uppercase tracking-[0.2em] text-flash/30 select-none">
                {sec.label}
              </div>
            )}
            {sec.options.map((o) => (
              <DropdownMenuItem
                key={o.value}
                onClick={() => onChange(o.value)}
                className={cn(
                  // before:hidden kills the base menu-item's white highlight bar
                  "flex items-center gap-2 cursor-clicker rounded-[3px] px-2.5 py-1.5 font-chakrapetch text-[11.5px] transition-colors before:hidden",
                  "focus:bg-jade/10 focus:text-jade",
                  value === o.value ? "text-jade bg-jade/[0.08]" : "text-flash/55"
                )}
              >
                {renderIcon && <span className="shrink-0 grid place-items-center w-[18px] h-[18px]">{renderIcon(o.value)}</span>}
                <span className="flex-1 truncate">{o.label}</span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function IconCombobox({
  value, onChange, options, placeholder, icon,
}: {
  value?: string;
  onChange: (v: string) => void;
  options: Opt[];
  placeholder: string;
  icon: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            triggerBase, "h-9 px-2 gap-2",
            active ? "border-jade/30 hover:border-jade/50" : "border-hairline/10 hover:border-hairline/20"
          )}
        >
          {active ? (
            <img src={icon(active.value)} className="w-6 h-6 rounded-[3px] border border-hairline/10 shrink-0" alt="" draggable={false} />
          ) : (
            <div className="w-6 h-6 rounded-[3px] bg-filmdark/40 border border-hairline/10 shrink-0" />
          )}
          <span className={cn("flex-1 text-left truncate font-chakrapetch text-[12px]", active ? "text-flash" : "text-flash/40")}>
            {active?.label ?? placeholder}
          </span>
          <ChevronDown className="w-3 h-3 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className={cn("w-[232px] p-0 overflow-hidden", GLASS)}>
        <Command className="bg-transparent">
          <CommandInput placeholder="Search…" className="font-chakrapetch text-[12px]" />
          <CommandList className="max-h-[248px] cyber-scrollbar">
            <CommandEmpty className="py-5 text-center font-chakrapetch text-[11px] text-flash/35">No match</CommandEmpty>
            <CommandGroup className="p-1">
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => { onChange(o.value); setOpen(false); }}
                  className={cn(
                    "gap-2 rounded-[3px] px-2 py-1.5 font-chakrapetch text-[12px] cursor-clicker",
                    "text-flash/70 aria-selected:bg-jade/10 aria-selected:text-jade"
                  )}
                >
                  <img src={icon(o.value)} className="w-6 h-6 rounded-[3px] border border-hairline/10 shrink-0" alt="" loading="lazy" draggable={false} />
                  <span className="flex-1 truncate">{o.label}</span>
                  {value === o.value && <Check className="w-3.5 h-3.5 text-jade shrink-0" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
