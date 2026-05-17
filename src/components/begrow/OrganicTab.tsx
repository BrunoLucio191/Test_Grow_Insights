import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, Eye, Heart, UserPlus, Instagram, Facebook, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchOrganicData } from "@/lib/analytics.functions";
import type { DateRange } from "@/lib/analytics-types";
import { KpiCard } from "./KpiCard";

const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

export function OrganicTab({ clientId, range }: { clientId: string; range: DateRange }) {
  const fn = useServerFn(fetchOrganicData);
  const { data, isLoading } = useQuery({
    queryKey: ["organic", clientId, range.from, range.to],
    queryFn: () => fn({ data: { clientId, range } }),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Novos Seguidores" value={fmt(data.kpis.newFollowers)} icon={UserPlus} delta="+18%" trend="up" />
        <KpiCard label="Alcance Total" value={fmt(data.kpis.reach)} icon={Eye} delta="+24%" trend="up" />
        <KpiCard label="Engajamento Médio" value={`${data.kpis.avgEngagement}%`} icon={Heart} delta="+0.6pp" trend="up" />
        <KpiCard label="Visitas ao Perfil" value={fmt(data.kpis.profileVisits)} icon={Users} delta="+11%" trend="up" />
      </div>

      <Card className="border-border/60 bg-card/60 p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Top Posts do período</h3>
            <p className="text-sm text-muted-foreground">Conteúdos com maior engajamento</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.topPosts.map((p) => (
            <article
              key={p.id}
              className="group overflow-hidden rounded-lg border border-border/60 bg-background/40 transition-colors hover:border-primary/40"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                <img
                  src={p.thumbnail}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-md bg-background/80 backdrop-blur">
                  {p.platform === "instagram" ? (
                    <Instagram className="h-4 w-4 text-foreground" />
                  ) : (
                    <Facebook className="h-4 w-4 text-foreground" />
                  )}
                </div>
              </div>
              <div className="space-y-3 p-4">
                <p className="line-clamp-2 text-sm text-foreground">{p.caption}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Heart className="h-3.5 w-3.5" /> {fmt(p.likes)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5" /> {fmt(p.comments)}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" /> {fmt(p.reach)}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
