CREATE TABLE public.meta_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  scope text NOT NULL,
  range_from date NOT NULL,
  range_to date NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, scope, range_from, range_to)
);

CREATE INDEX idx_meta_cache_lookup ON public.meta_cache (client_id, scope, range_to DESC);

ALTER TABLE public.meta_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_cache_read_all" ON public.meta_cache FOR SELECT USING (true);
CREATE POLICY "meta_cache_insert_all" ON public.meta_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "meta_cache_update_all" ON public.meta_cache FOR UPDATE USING (true);
CREATE POLICY "meta_cache_delete_all" ON public.meta_cache FOR DELETE USING (true);