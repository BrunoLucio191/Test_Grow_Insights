import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { ClientRow } from "@/lib/analytics-types";
import { createClient, deleteClient, importMetaAccounts } from "@/lib/clientes.server";
import { Building2, Sparkles, Plus, RefreshCw, Trash2, Loader2, LogOut } from "lucide-react";
import { signOut } from "../../services/auth.api";
import beGrowLogo from "../../assets/beGrowLogo.jpg";

type Props = {
  clients: ClientRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function ClientSidebar({ clients, selectedId, onSelect }: Props) {
  const qc = useQueryClient();
  const createFn = useServerFn(createClient);
  const deleteFn = useServerFn(deleteClient);
  const importFn = useServerFn(importMetaAccounts);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [toDelete, setToDelete] = useState<ClientRow | null>(null);

  const createMut = useMutation({
    mutationFn: (name: string) => createFn({ data: { name } }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      onSelect(row.id);
      setCreateOpen(false);
      setNewName("");
      toast.success(`Cliente "${row.name}" criado`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar cliente"),
  });

  const deleteMut = useMutation({
    mutationFn: (clientId: string) => deleteFn({ data: { clientId } }),
    onSuccess: (_d, clientId) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      if (selectedId === clientId) {
        const next = clients.find((c) => c.id !== clientId);
        if (next) onSelect(next.id);
      }
      toast.success("Cliente removido");
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover"),
  });

  const importMut = useMutation({
    mutationFn: () => importFn(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      if (r.imported > 0) {
        toast.success(
          `${r.imported} ${r.imported === 1 ? "conta importada" : "contas importadas"}`,
        );
      } else {
        toast.info(`Nenhuma conta nova (${r.total} já cadastradas)`);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao importar da Meta"),
  });

  const submitCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createMut.mutate(name);
  };

  return (
    <aside className="hidden w-92 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg">
          <img src={beGrowLogo} className="rounded-xl"></img>
        </div>
        <div>
          <p className="text-sm font-semibold text-sidebar-foreground">Grow Insights</p>
          <p className="text-xs text-muted-foreground">Análises & Insights</p>
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
              <div
                key={c.id}
                className={cn(
                  "group relative flex w-full items-center gap-3 rounded-lg pl-3 pr-2 py-2.5 text-left text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <button
                  onClick={() => onSelect(c.id)}
                  className="flex flex-1 items-center gap-3 overflow-hidden text-left"
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setToDelete(c);
                  }}
                  className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                  aria-label={`Remover ${c.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="space-y-2 border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sidebar-foreground/80"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Novo cliente
        </Button>

        {/* Botão de Sign Out atualizado */}
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sidebar-foreground/80 hover:bg-destructive/15 hover:text-destructive"
          onClick={async () => {
            try {
              await signOut(); // Aciona a função de logout do Supabase no servidor
              window.location.reload(); // Recarrega a página imediatamente após o sucesso
            } catch (error) {
              toast.error("Erro ao efetuar logout");
            }
          }}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>

        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-sidebar-foreground/80"
          onClick={() => importMut.mutate()}
          disabled={importMut.isPending}
        >
          {importMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Importar da Meta
        </Button>
        <div className="mt-1 flex items-center gap-2 rounded-md bg-sidebar-accent/40 px-3 py-2 text-xs text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" />
          <span>{clients.length} contas conectadas</span>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
            <DialogDescription>
              Crie um cliente em branco. Você poderá adicionar os IDs da Meta depois nas
              configurações.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              placeholder="Nome do cliente"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCreate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitCreate} disabled={createMut.isPending || !newName.trim()}>
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete
                ? `"${toDelete.name}" e todo o cache associado serão removidos. Esta ação não pode ser desfeita.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) deleteMut.mutate(toDelete.id);
              }}
            >
              {deleteMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
