-- =====================================================================
-- Migração 0006: validação de comissão (critério do gestor, docs D5)
-- Flags de assinatura eletrônica vindas das TAGS do contrato no SGP.
-- null = ainda não verificado pelo sync; false = pendente; true = assinado.
-- =====================================================================
alter table contratos
  add column if not exists termo_adesao_assinado boolean,
  add column if not exists fidelidade_assinada boolean,
  add column if not exists assinaturas_verificadas_em timestamptz;

create index if not exists contratos_assinatura_pendente_idx
  on contratos (data_venda desc)
  where status <> 'cancelado'
    and (termo_adesao_assinado is not true or fidelidade_assinada is not true);
