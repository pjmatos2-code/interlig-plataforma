-- =====================================================================
-- 0010: status oficial de comissão do SGP por contrato (fonte: PDF Detalhe Comissão)
-- Serve para conferência lado a lado com a nossa validação D5.
-- =====================================================================
create table if not exists comissao_sgp_itens (
  id            uuid primary key default gen_random_uuid(),
  competencia   date not null,                    -- 1º dia do mês
  sgp_contrato_id text not null,
  contrato_id   uuid references contratos(id) on delete set null,
  vendedor_id   uuid references vendedores(id) on delete set null,
  vendedor_nome text not null,
  plano         text,
  data_venda    date,
  vl_plano      numeric(10,2),
  vl_base       numeric(10,2),
  status_sgp    text not null check (status_sgp in ('elegivel','pendente','glosado')),
  servico_sgp   text,                             -- Ativo / Inativo
  importado_em  timestamptz not null default now(),
  unique (competencia, sgp_contrato_id)
);
create index if not exists comissao_sgp_itens_comp_idx on comissao_sgp_itens (competencia, vendedor_id);

alter table comissao_sgp_itens enable row level security;
drop policy if exists sgp_itens_sel on comissao_sgp_itens;
create policy sgp_itens_sel on comissao_sgp_itens for select to authenticated using (true);
