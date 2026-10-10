-- 0110: ocorrências de atendimento do SGP (10/10/2026) — Relatórios →
-- Atendimento → Ocorrências. Base do módulo de prevenção de cancelamento:
-- os motivos de suporte que o gestor citou (Acesso lento, Link loss, Luz
-- alta, Sem acesso, Outros, Chamado Fortics) são TIPOS de ocorrência, não
-- motivos de OS. Também traz cobrança, promessa de pagamento, pedido de
-- cancelamento, retenção e downgrade.
create table if not exists public.ocorrencias_sgp (
  sgp_ocorrencia_id text primary key,
  sgp_contrato_id text,
  sgp_cliente_id text,
  tipo text,
  metodo text,
  status text,
  criada_em timestamptz,
  encerrada_em timestamptz,
  usuario text,
  pop text,
  sgp_os_id text,
  lido_em timestamptz not null default now()
);
create index if not exists ocorrencias_sgp_contrato_idx on public.ocorrencias_sgp (sgp_contrato_id, criada_em);
create index if not exists ocorrencias_sgp_criada_idx on public.ocorrencias_sgp (criada_em);
alter table public.ocorrencias_sgp enable row level security;
-- sem policy: só o servidor (service role) lê
notify pgrst, 'reload schema';
