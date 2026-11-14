-- 0127: a gerência não tem early churn (decisão do Paulo em 03/11/2026) — a
-- gestão recebe pelo total vendido no mês. O débito de early churn continua só
-- das vendedoras. Em outubro/2026 o débito delas (61 contratos da safra de
-- julho) derrubava o pilar Vendas da gerência de 261 para 200.
-- O código não lê mais flag_early_churn; a coluna fica pelo histórico
-- (setembro/2026 foi o mês de migração, sem early churn nem clawback).
comment on column gerencia_config.flag_early_churn is
  'Sem uso desde 03/11/2026: a gerência não tem early churn (recebe pelo total vendido no mês).';

insert into gerencia_config (competencia, flag_early_churn, flag_clawback, observacao)
values ('2026-10-01', false, true, 'gerência sem early churn — recebe pelo total vendido no mês (decisão do Paulo em 03/11/2026)')
on conflict (competencia) do update
  set flag_early_churn = excluded.flag_early_churn,
      observacao = excluded.observacao;
