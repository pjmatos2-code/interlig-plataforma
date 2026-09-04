-- 0082: base de assinantes por unidade e mês (Relatórios > Contratos >
-- Crescimento do SGP), lida diariamente pelo leitor de painel. Alimenta o
-- gráfico "Base das unidades" do dashboard (pedido do gestor, 04/09/2026).
create table if not exists crescimento_base (
  mes            date not null,          -- primeiro dia do mês
  unidade        text not null,          -- Altamira | Vitória do Xingu | Brasil Novo
  ativos         integer not null default 0,
  novos          integer not null default 0,
  cancelados_mes integer not null default 0,
  suspensos      integer not null default 0,
  atualizado_em  timestamptz not null default now(),
  primary key (mes, unidade)
);

alter table crescimento_base enable row level security;
drop policy if exists crescimento_sel on crescimento_base;
create policy crescimento_sel on crescimento_base for select to authenticated using (true);
