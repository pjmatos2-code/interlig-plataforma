-- =====================================================================
-- 0044: debito de meta (inadimplentes 90d) TRAVADO no dia 1o do mes.
-- Regra do gestor (28/08): a vendedora precisa saber o numero de pendentes
-- no primeiro dia do mes; a analise considera os 90 dias daquela data e o
-- numero fica CONGELADO o mes inteiro (nao flutua com pagamentos do meio do
-- mes). Set/2026 entra com a relacao validada pela equipe (origem manual);
-- dos meses seguintes em diante a plataforma congela sozinha no 1o sync do
-- dia 1o (origem automatico). Manual nunca e sobrescrito.
create table if not exists debitos_meta_mensal (
  id           uuid primary key default gen_random_uuid(),
  competencia  date not null,
  vendedor_id  uuid not null references vendedores(id) on delete cascade,
  quantidade   int not null check (quantidade >= 0),
  origem       text not null default 'automatico' check (origem in ('manual', 'automatico')),
  criado_em    timestamptz not null default now(),
  unique (competencia, vendedor_id)
);

alter table debitos_meta_mensal enable row level security;
drop policy if exists debitos_sel on debitos_meta_mensal;
create policy debitos_sel on debitos_meta_mensal for select to authenticated
  using (
    app.eh_gestor()
    or vendedor_id = app.vendedor_atual()
    or (app.eh_supervisor() and app.agente_sob_coord(vendedor_id))
  );
drop policy if exists debitos_adm on debitos_meta_mensal;
create policy debitos_adm on debitos_meta_mensal for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());
