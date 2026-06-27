
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS attribution_window text;

CREATE TABLE IF NOT EXISTS public.campaign_groups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  campaign_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_groups TO anon;
GRANT ALL ON public.campaign_groups TO service_role;

ALTER TABLE public.campaign_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_groups_all" ON public.campaign_groups
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS campaign_groups_client_idx ON public.campaign_groups(client_id);
