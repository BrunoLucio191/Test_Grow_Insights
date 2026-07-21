// useValidSession.ts (Frontend)
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { verificarSessao } from "@/serverFunctions/user.server"; // Importa a ponte
// Importe o seu supabaseClient normal do frontend aqui se quiser rodar o signOut local

export function useValidSession() {
  const navigate = useNavigate();

  return useQuery({
    queryKey: ["valida-sessao-supabase"],
    queryFn: async () => {
      const sessao = await verificarSessao();

      if (!sessao.isValido) {
        console.log(`Token expirado: ${sessao.erro}`);
        navigate({
          to: "/login",
          replace: true,
        });
        return null;
      }

      return sessao.user;
    },
    refetchInterval: 3600000,
  });
}
