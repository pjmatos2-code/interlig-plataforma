-- 0133: cadastros do SGP fora da plataforma por cidade + venda retomada
-- (18/11/2026).
--
-- (1) O sync só importa cliente cuja cidade ele reconhece como atendida. Quem
-- ficava de fora sumia em silêncio: uma cidade digitada errada no SGP
-- ("ALTMIRA", "ALTAMITA") tirou duas vendas de novembro da plataforma e os
-- tickets do CRM nunca reconciliaram. A leitura ficou tolerante a erro de
-- digitação (lib/sgp/cidade.ts) e o que ainda sobrar de fora passa a ser
-- gravado aqui, para o gestor ver em Administração.
create table if not exists public.sgp_fora_do_escopo (
  sgp_cliente_id    text primary key,
  nome              text,
  cidade_digitada   text,
  uf                text,
  contratos         int not null default 0,
  contratos_ativos  int not null default 0,
  ultimo_contrato_em date,
  visto_em          timestamptz not null default now()
);
comment on table public.sgp_fora_do_escopo is
  'Clientes do SGP que o sync deixou de fora porque a cidade do cadastro não é das atendidas. O sync inclui e remove sozinho; nada é digitado aqui.';
alter table public.sgp_fora_do_escopo enable row level security;
-- sem policy: traz nome de cliente — só o servidor (service role) lê

-- (2) Venda retomada: contrato cadastrado no SGP em um mês, que não seguiu, e
-- que o cliente fechou de fato depois (caso real: cadastro em 28/09, venda
-- retomada e assinada em 12/11). A gestão decide que a venda vale na data da
-- retomada. O sync copiava a data de cadastro do SGP a cada passada; com
-- venda_retomada_em preenchido ele passa a respeitar a data ajustada.
alter table public.contratos
  add column if not exists data_venda_sgp date,
  add column if not exists venda_retomada_em timestamptz,
  add column if not exists venda_retomada_por uuid references public.usuarios(id) on delete set null,
  add column if not exists venda_retomada_motivo text;
comment on column public.contratos.data_venda_sgp is
  'Data de cadastro do contrato no SGP, sempre a original. data_venda é a que vale para os indicadores; as duas só diferem em venda retomada.';
comment on column public.contratos.venda_retomada_em is
  'Quando a gestão ajustou a data da venda (venda retomada). Preenchido, o sync não sobrescreve data_venda.';
-- data_venda_sgp não é preenchida aqui de propósito: o sync grava em cada
-- contrato na passada seguinte, sem disparar os gatilhos de aviso em 17 mil linhas.

notify pgrst, 'reload schema';
