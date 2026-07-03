-- Adiciona o vínculo do cliente com o usuário autenticado
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS user_id uuid
REFERENCES auth.users(id)
ON DELETE SET NULL;

-- Habilita RLS na tabela de clientes (caso ainda não esteja)
ALTER TABLE public.clients
ENABLE ROW LEVEL SECURITY;

-- Garante que a tabela de campaign_groups também esteja com RLS habilitado
ALTER TABLE public.campaign_groups
ENABLE ROW LEVEL SECURITY;

-- Remove a policy insegura criada anteriormente
DROP POLICY IF EXISTS "campaign_groups_all"
ON public.campaign_groups;

-- Remove permissões do usuário anônimo
REVOKE ALL
ON public.campaign_groups
FROM anon;

-- Cria uma nova policy permitindo acesso apenas a usuários autenticados
CREATE POLICY "authenticated_access_all"
ON public.campaign_groups
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);