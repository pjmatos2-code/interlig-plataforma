-- 0012: importação de negociações do RD Station (export deal CSV)
-- rd_deal_id garante idempotência da carga.
alter table tickets add column if not exists rd_deal_id text unique;
