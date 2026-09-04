-- 0083: cancelados ACUMULADOS na base por unidade (o mock do dashboard usa o
-- acumulado como no relatório do SGP; o "no mês" continua para o texto).
alter table crescimento_base add column if not exists cancelados_acum integer not null default 0;
