import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ClientRow } from "@/lib/analytics-types";
import { Building2, Sparkles, Plus } from "lucide-react";

type Props = {
  clients: ClientRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function ClientSidebar({ clients, selectedId, onSelect }: Props) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-sidebar-foreground">BeGrow OS</p>
          <p className="text-xs text-muted-foreground">Analytics & AI</p>
        </div>
      </div>

      <div className="px-3 pb-2">
        <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Clientes
        </p>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 pb-3">
          {clients.map((c) => {
            const active = c.id === selectedId;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-sidebar-accent/60 text-sidebar-foreground",
                  )}
                >
                  {c.name
                    .split(" ")
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")}
                </div>
                <span className="truncate font-medium">{c.name}</span>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      <div className="border-t border-sidebar-border p-3">
        <Button variant="ghost" className="w-full justify-start gap-2 text-sidebar-foreground/80">
          <Plus className="h-4 w-4" />
          Novo cliente
        </Button>
        <div className="mt-3 flex items-center gap-2 rounded-md bg-sidebar-accent/40 px-3 py-2 text-xs text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" />
          <span>{clients.length} contas conectadas</span>
        </div>
      </div>
    </aside>
  );
}
