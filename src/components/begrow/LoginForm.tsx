import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { signIn } from "../../services/auth.api";
import { authQueries } from "@/services/queries";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export const LoginForm = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const signInMutation = useMutation({
    mutationFn: signIn,
    onSuccess: (response) => {
      if (response?.error) {
        toast.error(response.error);
        return;
      }

      navigate({ to: "/" });
      queryClient.invalidateQueries(authQueries.user());
    },
  });

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    signInMutation.mutate({ data: { email, password } });
  };

  return (
    <div className="w-full max-w-sm rounded-xl border border-border/60 bg-card/60 p-8 shadow-sm backdrop-blur">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Acessar Painel</h1>
        <p className="text-sm text-muted-foreground">
          Insira suas credenciais para visualizar as métricas.
        </p>
      </div>

      <form className="flex flex-col gap-5" onSubmit={onSubmit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email" className="text-sm font-medium text-foreground">
            E-mail
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="seu@email.com"
            required
            className="bg-background/50 transition-colors focus-visible:ring-1"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium text-foreground">
              Senha
            </Label>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            required
            className="bg-background/50 transition-colors focus-visible:ring-1"
          />
        </div>

        <Button
          type="submit"
          className="mt-2 w-full gap-2 font-medium"
          disabled={signInMutation.isPending}
        >
          {signInMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Autenticando...
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              Entrar no sistema
            </>
          )}
        </Button>
      </form>
    </div>
  );
};
