-- 0033: controle do leitor de painel (identificação do vendedor no SGP).
-- Marca quando o leitor checou o contrato — com ou sem vendedor no SGP —
-- para não rebuscar a mesma página a cada sync.
alter table contratos add column if not exists vendedor_painel_verificado_em timestamptz;
create index if not exists contratos_vendedor_painel_idx
  on contratos (data_venda desc)
  where vendedor_id is null and vendedor_painel_verificado_em is null;
