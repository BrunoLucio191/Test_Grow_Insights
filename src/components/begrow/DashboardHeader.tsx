import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, RefreshCw, TrendingUp, Radio, Check, Clock, Settings, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { validateClient, type DateRange, type ClientRow } from "@/lib/analytics-types";
import type { CacheStatus } from "@/lib/analytics.functions";

export type SyncProgress = {
  paid: "idle" | "running" | "done" | "error";
  organic: "idle" | "running" | "done" | "error";
};

type Props = {
  client: ClientRow;
  range: DateRange;
  onRangeChange: (r: DateRange) => void;
  onSync: () => void;
  onOpenSettings: () => void;
  syncing?: boolean;
  syncProgress?: SyncProgress;
  cacheStatus?: CacheStatus | null;
};

function ScopePill({
  label,
  icon,
  status,
}: {
  label: string;
  icon: React.ReactNode;
  status: SyncProgress["paid"];
}) {
  const colors =
    status === "done"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
      : status === "running"
        ? "border-primary/40 bg-primary/10 text-primary"
        : status === "error"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border/60 bg-muted/30 text-muted-foreground";
  return (
    <div className={cn("flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium", colors)}>
      {icon}
      <span>{label}</span>
      {status === "running" && <RefreshCw className="h-3 w-3 animate-spin" />}
      {status === "done" && <Check className="h-3 w-3" />}
    </div>
  );
}

function CacheLine({
  label,
  icon,
  fetchedAt,
  expiresAt,
  ttlSeconds,
  now,
}: {
  label: string;
  icon: React.ReactNode;
  fetchedAt: string | null;
  expiresAt: string | null;
  ttlSeconds: number;
  now: number;
}) {
  if (!fetchedAt || !expiresAt) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span className="font-medium">{label}:</span>
        <span>sem cache</span>
      </div>
    );
  }
  const fetched = new Date(fetchedAt).getTime();
  const expires = new Date(expiresAt).getTime();
  const remainingMs = Math.max(0, expires - now);
  const pct = Math.max(0, Math.min(100, ((expires - now) / (ttlSeconds * 1000)) * 100));
  const expired = remainingMs <= 0;

  return (
    <div className="flex flex-col gap-1 min-w-[180px]">
      <div className="flex items-center gap-2 text-xs">
        {icon}
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">
          · há {formatDistanceToNow(fetched, { locale: ptBR })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Progress value={pct} className="h-1 flex-1" />
        <span className={cn("text-[10px] tabular-nums", expired ? "text-destructive" : "text-muted-foreground")}>
          {expired
            ? "expirado"
            : `${Math.ceil(remainingMs / 60000)}m restantes`}
        </span>
      </div>
    </div>
  );
}

export function DashboardHeader({
  client,
  range,
  onRangeChange,
  onSync,
  onOpenSettings,
  syncing,
  syncProgress,
  cacheStatus,
}: Props) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const from = new Date(range.from);
  const to = new Date(range.to);
  const validation = validateClient(client);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="flex flex-col gap-4 border-b border-border/60 bg-background/60 px-6 py-5 backdrop-blur">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Cliente ativo
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            {client.name}
            {!validation.anyOk && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                <AlertTriangle className="h-3 w-3" /> IDs incompletos
              </span>
            )}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={onOpenSettings} title="Configurar IDs">
            <Settings className="h-4 w-4" />
          </Button>
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
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <CacheLine
          label="Tráfego Pago"
          icon={<TrendingUp className="h-3 w-3 text-primary" />}
          fetchedAt={cacheStatus?.paid.fetchedAt ?? null}
          expiresAt={cacheStatus?.paid.expiresAt ?? null}
          ttlSeconds={cacheStatus?.ttlSeconds ?? 3600}
          now={now}
        />
        <CacheLine
          label="Orgânico"
          icon={<Radio className="h-3 w-3 text-primary" />}
          fetchedAt={cacheStatus?.organic.fetchedAt ?? null}
          expiresAt={cacheStatus?.organic.expiresAt ?? null}
          ttlSeconds={cacheStatus?.ttlSeconds ?? 3600}
          now={now}
        />
        {syncing && syncProgress && (
          <div className="ml-auto flex items-center gap-2">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <ScopePill
              label="Pago"
              icon={<TrendingUp className="h-3 w-3" />}
              status={syncProgress.paid}
            />
            <ScopePill
              label="Orgânico"
              icon={<Radio className="h-3 w-3" />}
              status={syncProgress.organic}
            />
          </div>
        )}
      </div>
    </header>
  );
}
