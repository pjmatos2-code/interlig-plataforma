-- 0054: ajuste manual de valor e de duplicidade nos aditivos.
--
-- Dois casos reais de agosto/2026 mostraram que o valor vindo do SGP nem
-- sempre serve como base:
--
--  · o plano "DEDICADO 10 GB" está cadastrado com R$ 9.000, que é o valor
--    ANUAL (os títulos vencem de ano em ano; a mensalidade real é R$ 750).
--    Como o contrato repete o valor do plano, não há discrepância para a
--    normalização automática detectar — precisa de decisão humana.
--  · o mesmo contrato pode receber dois aditivos no mês (Cargill recebeu um de
--    fidelidade e um de mudança de plano). A gestão decidiu contar um só.
--
-- O ajuste fica separado do valor sincronizado: o sync continua atualizando
-- valor_mensal a cada rodada, e o ajustado tem precedência quando existe.
alter table aditivos
  add column if not exists valor_mensal_ajustado numeric(12,2),
  add column if not exists valor_ajuste_motivo   text;

comment on column aditivos.valor_mensal_ajustado is
  'Quando preenchido, substitui valor_mensal na base da comissão. O sync não sobrescreve.';
