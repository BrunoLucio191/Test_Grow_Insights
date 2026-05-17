import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Sparkles, Loader2, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchMetaAdsData,
  fetchOrganicData,
  generateAiInsights,
} from "@/lib/analytics.functions";
import type { DateRange } from "@/lib/analytics-types";

export function AiTab({
  clientId,
  clientName,
  range,
}: {
  clientId: string;
  clientName: string;
  range: DateRange;
}) {
  const qc = useQueryClient();
  const generate = useServerFn(generateAiInsights);
  const paidFn = useServerFn(fetchMetaAdsData);
  const organicFn = useServerFn(fetchOrganicData);

  const [loading, setLoading] = useState(false);
  const [markdown, setMarkdown] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setMarkdown(null);
    try {
      const [paid, organic] = await Promise.all([
        qc.fetchQuery({
          queryKey: ["paid", clientId, range.from, range.to],
          queryFn: () => paidFn({ data: { clientId, range } }),
        }),
        qc.fetchQuery({
          queryKey: ["organic", clientId, range.from, range.to],
          queryFn: () => organicFn({ data: { clientId, range } }),
        }),
      ]);
      const result = await generate({
        data: { clientName, metrics: { paid, organic } },
      });
      setMarkdown(result.markdown);
    } catch (e) {
      setMarkdown(`## Erro\n${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden border-border/60 bg-card/60 p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-30 blur-3xl"
          style={{ background: "var(--gradient-primary)" }}
        />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-lg"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">AI Optimizer</h3>
              <p className="text-sm text-muted-foreground">
                Consultor virtual analisa as métricas e sugere otimizações para mídia paga e orgânica.
              </p>
            </div>
          </div>
          <Button onClick={run} disabled={loading} size="lg" className="gap-2">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando análise...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Gerar Plano de Otimização
              </>
            )}
          </Button>
        </div>
      </Card>

      <Card className="min-h-[400px] border-border/60 bg-card/60 p-8">
        {!markdown && !loading && (
          <div className="flex h-[360px] flex-col items-center justify-center text-center">
            <div className="mb-4 rounded-full bg-primary/10 p-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <p className="text-base font-medium text-foreground">Pronto para otimizar?</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Clique em &ldquo;Gerar Plano de Otimização&rdquo; e o AI Optimizer vai cruzar os dados de
              tráfego pago e orgânico de <span className="font-medium text-foreground">{clientName}</span> para entregar
              um plano de ação.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex h-[360px] flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              Analisando campanhas, KPIs e top posts...
            </p>
          </div>
        )}

        {markdown && (
          <article className="prose prose-invert prose-sm max-w-none prose-headings:font-semibold prose-h2:mt-6 prose-h2:text-xl prose-h3:mt-4 prose-strong:text-foreground prose-a:text-primary">
            <ReactMarkdown>{markdown}</ReactMarkdown>
          </article>
        )}
      </Card>
    </div>
  );
}
