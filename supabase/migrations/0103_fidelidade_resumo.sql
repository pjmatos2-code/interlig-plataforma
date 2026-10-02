-- =====================================================================
-- 0103: fidelidade da base por unidade (01/10/2026).
--
-- Resumo diário do relatório Financeiro → Fidelidades do SGP: contratos
-- ATIVOS sem fidelidade (o SGP move para cá quem venceu) e os que vencem em
-- até 30, 31–60 e 61–90 dias, por unidade. Só contagens — a lista nominal
-- fica no SGP (o link da plataforma abre o relatório já filtrado).
-- =====================================================================

create table if not exists public.fidelidade_resumo (
  pop_sgp_id    integer not null,
  unidade       text not null,
  faixa         text not null check (faixa in ('sem', 'ate30', 'ate60', 'ate90')),
  quantidade    integer not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (pop_sgp_id, faixa)
);

alter table public.fidelidade_resumo enable row level security;

drop policy if exists fidelidade_resumo_sel on public.fidelidade_resumo;
create policy fidelidade_resumo_sel on public.fidelidade_resumo
  for select to authenticated using (true);

notify pgrst, 'reload schema';
