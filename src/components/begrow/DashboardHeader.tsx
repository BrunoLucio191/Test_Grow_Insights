import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DateRange } from "@/lib/analytics-types";

type Props = {
  clientName: string;
  range: DateRange;
  onRangeChange: (r: DateRange) => void;
  onSync: () => void;
  syncing?: boolean;
};

export function DashboardHeader({ clientName, range, onRangeChange, onSync, syncing }: Props) {
  const [open, setOpen] = useState(false);
  const from = new Date(range.from);
  const to = new Date(range.to);

  return (
    <header className="flex flex-col gap-4 border-b border-border/60 bg-background/60 px-6 py-5 backdrop-blur md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Cliente ativo
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {clientName}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("justify-start gap-2 font-normal")}>
              <CalendarIcon className="h-4 w-4" />
              {format(from, "dd MMM", { locale: ptBR })} – {format(to, "dd MMM yyyy", { locale: ptBR })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={{ from, to }}
              onSelect={(r) => {
                if (r?.from && r?.to) {
                  onRangeChange({
                    from: r.from.toISOString().slice(0, 10),
                    to: r.to.toISOString().slice(0, 10),
                  });
                }
              }}
              numberOfMonths={2}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <Button onClick={onSync} disabled={syncing} className="gap-2">
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          Sincronizar dados
        </Button>
      </div>
    </header>
  );
}
