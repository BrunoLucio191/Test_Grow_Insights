
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  meta_ad_account_id TEXT,
  meta_page_id TEXT,
  ig_account_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Public read for the dashboard (no auth in this version). Adjust later when adding auth.
CREATE POLICY "clients_read_all" ON public.clients FOR SELECT USING (true);
CREATE POLICY "clients_insert_all" ON public.clients FOR INSERT WITH CHECK (true);
CREATE POLICY "clients_update_all" ON public.clients FOR UPDATE USING (true);

INSERT INTO public.clients (name, meta_ad_account_id, meta_page_id, ig_account_id) VALUES
  ('JG Campos', 'act_000000001', '1000000001', '1700000001'),
  ('Leandra Soares', 'act_000000002', '1000000002', '1700000002'),
  ('Raul Lamarca', 'act_000000003', '1000000003', '1700000003');
