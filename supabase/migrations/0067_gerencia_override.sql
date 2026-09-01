-- 0067: Módulo de Override de Gerência (Instrução Geral Ago/2026, Seção 6 · v1.1).
--
-- soma_meta: quem compõe a META GERENCIAL de vendas. Resultado de quem está
-- fora (rampa, loja, coordenação) continua contando em volume e valor.
alter table vendedores add column if not exists soma_meta boolean not null default true;
update vendedores set soma_meta = false
 where nome in ('Ivanilda VTX', 'Maclicya Martins', 'Marcelo Otávio', 'Aline Santos', 'Loja VTX', 'Marcelo Lopes PJ');
comment on column vendedores.soma_meta is
  'Compõe a meta gerencial de vendas (override). Rampa de novata, loja e coordenação ficam de fora; o volume/valor delas conta mesmo assim.';

-- flags por competência (mês de migração: ambas OFF)
create table if not exists gerencia_config (
  competencia date primary key,
  flag_early_churn boolean not null default true,
  flag_clawback boolean not null default true,
  observacao text
);
insert into gerencia_config (competencia, flag_early_churn, flag_clawback, observacao)
values ('2026-09-01', false, false, 'mês de migração para a plataforma — sem clawback e sem early churn na gerência')
on conflict (competencia) do nothing;

alter table gerencia_config enable row level security;
drop policy if exists gerencia_config_sel on gerencia_config;
create policy gerencia_config_sel on gerencia_config for select to authenticated
  using (app.eh_gestor() or app.eh_financeiro());
