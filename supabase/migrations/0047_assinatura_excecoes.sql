-- 0047: nem todo contrato exige as duas assinaturas.
--
-- Levantamento de 29/08/2026 com a gestão, caso a caso:
--  · LigChip é só serviço — não tem Termo de Adesão nem Fidelidade. Exigir
--    assinatura nesses contratos travava comissão por um documento que não
--    existe (ex.: #22471, LigChip do Ruan Matheus, cobrado da Damely).
--  · Ponto de cortesia (bonificado) não gera fidelidade — não damos nada em
--    troca de prazo (ex.: #22436, 2º ponto do Condomínio Tropical Prime).
--  · Ponto atrelado a contrato de licitação já tem instrumento próprio e não
--    pede assinatura nova (ex.: #22334, Altanet ligada a contrato da
--    prefeitura).
--
-- A trava de assinatura continua absoluta para todo o resto.

alter table planos
  add column if not exists exige_assinatura boolean not null default true;

comment on column planos.exige_assinatura is
  'false para produtos sem Termo de Adesão/Fidelidade (LigChip e afins).';

update planos set exige_assinatura = false
where nome ilike '%ligchip%';

alter table contratos
  add column if not exists assinatura_dispensada boolean not null default false,
  add column if not exists assinatura_dispensada_motivo text,
  add column if not exists assinatura_dispensada_por uuid references usuarios(id) on delete set null,
  add column if not exists assinatura_dispensada_em timestamptz;

comment on column contratos.assinatura_dispensada is
  'Contrato que não requer assinatura (cortesia, licitação, aditivo). Marcado pelo gestor com motivo — diferente de aprovar uma venda sem assinatura.';
