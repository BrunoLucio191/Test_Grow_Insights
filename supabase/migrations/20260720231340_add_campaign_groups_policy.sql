alter table public.campaign_groups enable row level security;

create policy "Users can read campaign groups"
on public.campaign_groups
for select
to authenticated
using (true);