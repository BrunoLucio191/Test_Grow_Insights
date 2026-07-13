import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, AlertCircle, Loader2, Plug, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { updateClient } from "@/lib/clientes.server";
import {
  testMetaConnection,
  type ConnectionTest,
  type ConnectionCheck,
} from "@/lib/campDetal.server";
import { ATTRIBUTION_OPTIONS, type ClientRow, type AttributionWindow } from "@/lib/analytics-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/utils";

type Props = {
  client: ClientRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

function CheckRow({ check }: { check: ConnectionCheck }) {
  const Icon = check.ok ? Check : AlertCircle;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
        check.ok
          ? "border-emerald-500/40 bg-desctructive/5 text-emerald-300"
          : "border-destructive/40 bg-destructive/5 text-destructive",
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{check.label}</div>
        <div className="mt-0.5 wrap-break-words text-[11px] opacity-90">
          {check.ok ? check.detail : check.error}
        </div>
      </div>
    </div>
  );
}

export function ClientSettingsDialog({ client, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateClient);
  const testFn = useServerFn(testMetaConnection);

  const [name, setName] = useState("");
  const [adId, setAdId] = useState("");
  const [pageId, setPageId] = useState("");
  const [igId, setIgId] = useState("");
  const [token, setToken] = useState("");
  const [convEvent, setConvEvent] = useState("");
  const [attribution, setAttribution] = useState<AttributionWindow | "">("");
  const [test, setTest] = useState<ConnectionTest | null>(null);

  useEffect(() => {
    if (client) {
      setName(client.name ?? "");
      setAdId(client.meta_ad_account_id ?? "");
      setPageId(client.meta_page_id ?? "");
      setIgId(client.ig_account_id ?? "");
      setToken(client.meta_access_token ?? ""); // NOVO EFFECT: Puxa do banco
      setConvEvent(client.conversion_event ?? "");
      setAttribution((client.attribution_window as AttributionWindow) ?? "");
      setTest(null);
    }
  }, [client, open]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          clientId: client!.id,
          name: name.trim(),
          meta_ad_account_id: adId.trim() || null,
          meta_page_id: pageId.trim() || null,
          ig_account_id: igId.trim() || null,
          meta_access_token: token.trim() || null,
          conversion_event: convEvent.trim() || null,
          attribution_window: (attribution || null) as AttributionWindow | null,
        },
      }),

    onSuccess: () => {
      toast.success("Cliente atualizado");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["cache-status"] });
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error) ?? "Falha ao salvar"),
  });

  const runTest = useMutation({
    mutationFn: async () => {
      // Save first so the test uses the latest IDs
      await save.mutateAsync();
      return testFn({ data: { clientId: client!.id } });
    },
    onSuccess: (r) => setTest(r),
    onError: (error: unknown) => toast.error(getErrorMessage(error) ?? "Falha no teste"),
  });

  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar conexão Meta</DialogTitle>
          <DialogDescription>
            IDs reais usados para puxar dados de tráfego pago, Facebook Page e Instagram.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cname">Nome do cliente</Label>
            <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adid">Meta Ads Account ID</Label>
            <Input
              id="adid"
              placeholder="act_1234567890"
              value={adId}
              onChange={(e) => setAdId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pageid">Facebook Page ID</Label>
            <Input
              id="pageid"
              placeholder="1234567890"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="igid">Instagram Account ID</Label>
            <Input
              id="igid"
              placeholder="17841400000000000"
              value={igId}
              onChange={(e) => setIgId(e.target.value)}
            />
          </div>

          {/* NOVO CAMPO: Meta Access Token */}
          <div className="space-y-1.5">
            <Label htmlFor="tokenid">Meta Access Token</Label>
            <Input
              id="tokenid"
              type="password"
              placeholder="EAAGm0..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="convev">
              Evento de conversão <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="convev"
              placeholder="ex.: purchase, omni_purchase, lead"
              value={convEvent}
              onChange={(e) => setConvEvent(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Sobrescreve o evento usado como "Resultados" da campanha. Deixe vazio para usar a
              detecção automática (purchase &gt; lead &gt; link_click).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Janela de atribuição padrão</Label>
            <Select
              value={attribution || "default"}
              onValueChange={(v) => setAttribution(v === "default" ? "" : (v as AttributionWindow))}
            >
              <SelectTrigger>
                <SelectValue placeholder="7d clique + 1d view (padrão Meta)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">7d clique + 1d view (padrão Meta)</SelectItem>
                {ATTRIBUTION_OPTIONS.filter((o) => o.value !== "7d_click,1d_view").map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Pode ser sobrescrita temporariamente no dashboard.
            </p>
          </div>
        </div>

        {test && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Resultado do teste {!test.tokenPresent && "· token ausente"}
            </p>
            <CheckRow check={test.paid} />
            <CheckRow check={test.page} />
            <CheckRow check={test.instagram} />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => runTest.mutate()}
            disabled={runTest.isPending || save.isPending}
            className="gap-2"
          >
            {runTest.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
            Testar conexão
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
