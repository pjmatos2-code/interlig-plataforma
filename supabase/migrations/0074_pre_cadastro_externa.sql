-- 0074: pré-cadastro da venda externa + campos de apoio.
alter type etapa_ticket add value if not exists 'pre_cadastro';
alter table visitas_externas add column if not exists foto_doc_verso_path text;
alter table tickets add column if not exists vencimento_dia smallint
  check (vencimento_dia in (7, 14, 21, 28));
comment on column tickets.vencimento_dia is
  'Dia de vencimento escolhido pelo cliente na visita externa (7/14/21/28).';
