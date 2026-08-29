-- 0049: módulo financeiro — pagamento sobre competência FECHADA.
--
-- Desenho acertado com a gestão em 29/08/2026:
--  · quem apura (gestor) não é quem paga (financeiro) — separação de funções;
--  · o financeiro só enxerga competência fechada, e trabalha sobre o snapshot
--    imutável: nada que mude no SGP depois altera o que já foi apurado;
--  · só o Administrador fecha e só ele reabre, com motivo registrado;
--  · a agente vê o próprio demonstrativo depois do fechamento.

alter type perfil_usuario add value if not exists 'financeiro';

-- ---------------------------------------------------------------------
-- ciclo do pagamento e da reabertura sobre o snapshot já existente
-- ---------------------------------------------------------------------
alter table comissoes_fechadas
  add column if not exists pago_em        timestamptz,
  add column if not exists pago_por       uuid references usuarios(id) on delete set null,
  add column if not exists pagamento_obs  text,
  -- versão sobe a cada reabertura+refechamento: o PDF antigo continua
  -- identificável e o código de verificação muda junto
  add column if not exists versao         integer not null default 1,
  add column if not exists reaberto_em    timestamptz,
  add column if not exists reaberto_por   uuid references usuarios(id) on delete set null,
  add column if not exists reaberto_motivo text;

comment on column comissoes_fechadas.versao is
  'Sobe a cada reabertura. Compõe o código de verificação impresso no demonstrativo.';

-- histórico: reabrir não apaga o que foi apurado antes
create table if not exists comissoes_fechadas_historico (
  id           uuid primary key default gen_random_uuid(),
  vendedor_id  uuid not null references vendedores(id) on delete restrict,
  mes_ano      date not null,
  versao       integer not null,
  snapshot     jsonb not null,
  valor_total  numeric(12,2) not null,
  fechado_em   timestamptz not null,
  fechado_por  uuid references usuarios(id) on delete set null,
  arquivado_em timestamptz not null default now(),
  motivo       text
);

alter table comissoes_fechadas_historico enable row level security;
