-- 0066: desistência do cliente antes da ativação — sai das pendências.
alter table contratos add column if not exists desistencia_em timestamptz;
alter table contratos add column if not exists desistencia_por uuid references usuarios(id);
alter table contratos add column if not exists desistencia_motivo text;
comment on column contratos.desistencia_em is
  'Cliente desistiu antes de ativar (marcado pela gestão): o contrato sai da esteira e das pendências da vendedora. Se o SGP ativar depois, o sync não é afetado — a flag só esconde pendência.';
