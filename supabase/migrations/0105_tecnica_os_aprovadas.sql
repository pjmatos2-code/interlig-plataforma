-- 0105: aprovação da gestão para OS anulada por retorno em 72h (01/10/2026).
-- O gestor aprova sem justificativa e a OS volta a pontuar para o técnico.
create table if not exists public.tecnica_os_aprovadas (
  sgp_os_id   text primary key,
  aprovado_por uuid references public.usuarios(id),
  aprovado_em timestamptz not null default now()
);
alter table public.tecnica_os_aprovadas enable row level security;
drop policy if exists tecnica_os_aprovadas_sel on public.tecnica_os_aprovadas;
create policy tecnica_os_aprovadas_sel on public.tecnica_os_aprovadas for select to authenticated using (true);
notify pgrst, 'reload schema';
