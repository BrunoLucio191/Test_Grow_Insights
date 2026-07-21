import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseServerClient } from "../lib/supabase";

const linkGeradoSchema = z.object({
  clientId: z.string().uuid(),
  payload: z.any(), // Aqui entra o objeto unificado { paid, organic }
});

export const criarLinkCompartilhavel = createServerFn({ method: "POST" })
  .validator((d) => linkGeradoSchema.parse(d))
  .handler(async ({ data }) => {
    const supaBaseLogin = getSupabaseServerClient();

    const tokenSeguranca = crypto.randomUUID();

    const expira = new Date();
    expira.setHours(expira.getHours() + 1);

    const { error } = await supaBaseLogin.from("shared_links").insert({
      token: tokenSeguranca,
      client_id: data.clientId,
      expires_at: expira.toISOString(),
      snapshot: data.payload,
    });

    if (error) console.error(error);

    return tokenSeguranca;
  });

export const buscarLinkCompartilhavel = createServerFn({ method: "GET" })
  .validator((token: string) => z.string().uuid().parse(token))
  .handler(async ({ data: token }) => {
    const supaBase = getSupabaseServerClient();

    const { data: registroSemData, error: erroRls } = await supaBase
      .from("shared_links")
      .select("token, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (erroRls) {
      console.error("Erro de RLS ou Banco ao tentar ler a tabela:", erroRls);
    }

    if (!registroSemData) {
      console.log("O banco retornou VAZIO mesmo sem o filtro de data. Motivos possíveis:");
      console.log(
        "1. O token realmente não existe na tabela shared_links (confira maiúsculas/minúsculas ou espaços).",
      );
      console.log("2. O RLS está ATIVO para SELECT e bloqueando a leitura pública (anon).");
      throw new Error("Link não encontrado (Bloqueio de RLS ou Token inexistente)");
    }

    // 2. Agora fazemos a sua query original completa com o filtro de data
    const { data, error } = await supaBase
      .from("shared_links")
      .select("snapshot")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) {
      console.error("Erro na query principal:", error);
      throw new Error("Erro interno ao buscar link");
    }

    if (!data) {
      console.log(
        "O registro existe, mas a data atual é MAIOR que a de expiração. O link expirou!",
      );
      throw new Error("Link expirado");
    }

    return data.snapshot;
  });
