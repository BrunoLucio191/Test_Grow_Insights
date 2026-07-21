import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyDateState({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center rounded-xl  p-8 text-center  animate-in fade-in duration-500",
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border/50">
        <CalendarIcon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
        Nenhum período selecionado
      </h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Selecione uma data inicial e final no menu superior para carregar as métricas e gráficos
        deste cliente.
      </p>
    </div>
  );
}
