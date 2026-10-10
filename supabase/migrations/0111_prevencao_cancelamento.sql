-- 0111: módulo Prevenção de cancelamento (10/10/2026). Desenho aprovado pelo
-- gestor depois do teste retroativo:
--   1. fila de DÉBITO antes do lote de cancelamento (atraso > 15 dias:
--      34,5% são cancelados em 60 dias — é onde a previsão funciona);
--   2. pedidos de cancelamento x retenção (86% cancelam no mesmo dia);
--   3. alerta de insatisfação (2+ suportes em 30 dias);
--   4. motivos dos cancelamentos voluntários.
-- Fora da base: rede neutra, permutas e órgãos públicos. CNPJ e planos
-- corporativos ficam marcados para o filtro próprio.

create table if not exists public.prevencao_contatos (
  id uuid primary key default gen_random_uuid(),
  sgp_contrato_id text not null,
  fila text not null check (fila in ('debito', 'insatisfacao')),
  resultado text not null check (resultado in (
    'acordo', 'prometeu_pagar', 'ja_pagou', 'recusou',
    'resolvido', 'encaminhado_tecnica', 'quer_cancelar',
    'nao_atendeu')),
  observacao text,
  criado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists prevencao_contatos_contrato_idx on public.prevencao_contatos (sgp_contrato_id, criado_em desc);
alter table public.prevencao_contatos enable row level security;
-- sem policy: lido e gravado só pelo servidor (service role), após checar o perfil

-- base elegível: contrato ativo/suspenso, sem rede neutra/permuta/órgão público
create or replace function public.prevencao_base()
returns table (
  contrato_id uuid, sgp_contrato_id text, status text, sgp_cliente_id text, cliente text,
  telefone text, plano text, pop text, valor numeric, ativacao date, corporativo boolean
)
language sql stable as $$
  select c.id, c.sgp_contrato_id, c.status::text, cl.sgp_cliente_id, cl.nome, cl.telefone,
         p.nome, po.nome, c.valor_mensalidade, coalesce(c.data_ativacao, c.data_venda),
         length(regexp_replace(coalesce(cl.cpf, ''), '\D', '', 'g')) = 14
           or coalesce(p.nome, '') ~* 'CORPORATE|\mPJ\M|DEDICADO|EMPRESARIAL|COMERCIAL'
  from contratos c
  join clientes cl on cl.id = c.cliente_id
  left join planos p on p.id = c.plano_id
  left join pops po on po.id = c.pop_id
  where c.status in ('ativo', 'suspenso')
    and coalesce(p.nome, '') !~* 'rede neutra|permuta'
    and cl.nome !~* 'PERMUTA|PREFEITURA|FUNDO MUNICIPAL|SECRETARIA|MUNIC[IÍ]PIO|C[AÂ]MARA MUNICIPAL|SEMED|SESPA|CENTRO REGIONAL DE SA[UÚ]DE|GOVERNO|ESTADO DO PAR'
$$;

-- 1. débito: boleto vencido em aberto há mais de N dias
create or replace function public.prevencao_debito(p_dias int default 15)
returns table (
  contrato_id uuid, sgp_contrato_id text, status text, sgp_cliente_id text, cliente text,
  telefone text, plano text, pop text, valor numeric, corporativo boolean,
  boletos int, valor_aberto numeric, dias_atraso int, vencimento_antigo date,
  ultima_promessa timestamptz, suporte_90d int
)
language sql stable as $$
  with hoje as (select (now() at time zone 'America/Santarem')::date as d),
  deb as (
    select t.contrato_id, count(*)::int as boletos, sum(t.valor) as valor_aberto,
           min(t.vencimento) as venc
    from titulos t, hoje
    where t.status = 'aberto' and t.data_pagamento is null and t.vencimento < hoje.d
    group by t.contrato_id
  )
  select b.contrato_id, b.sgp_contrato_id, b.status, b.sgp_cliente_id, b.cliente, b.telefone,
         b.plano, b.pop, b.valor, b.corporativo,
         deb.boletos, deb.valor_aberto, (hoje.d - deb.venc)::int, deb.venc,
         (select max(o.criada_em) from ocorrencias_sgp o
            where o.sgp_contrato_id = b.sgp_contrato_id and o.tipo = 'Promessa de pagamento via URA'
              and o.criada_em >= now() - interval '60 days'),
         (select count(*)::int from ocorrencias_sgp o
            where o.sgp_contrato_id = b.sgp_contrato_id and o.criada_em >= now() - interval '90 days'
              and ((o.tipo like 'Suporte -%' and o.tipo not like '%Mudança de Endereço%') or o.tipo = 'Chamado Fortics'))
  from prevencao_base() b
  join deb on deb.contrato_id = b.contrato_id
  cross join hoje
  where hoje.d - deb.venc > p_dias
$$;

-- 3. insatisfação: 2+ chamados de suporte nos últimos N dias (cliente ativo)
create or replace function public.prevencao_insatisfacao(p_dias int default 30, p_minimo int default 2)
returns table (
  contrato_id uuid, sgp_contrato_id text, status text, sgp_cliente_id text, cliente text,
  telefone text, plano text, pop text, valor numeric, corporativo boolean, ativacao date,
  chamados int, tipos text[], ultimo timestamptz
)
language sql stable as $$
  with s as (
    select o.sgp_contrato_id, count(*)::int as chamados, array_agg(o.tipo order by o.criada_em desc) as tipos,
           max(o.criada_em) as ultimo
    from ocorrencias_sgp o
    where o.criada_em >= now() - make_interval(days => p_dias)
      and ((o.tipo like 'Suporte -%' and o.tipo not like '%Mudança de Endereço%') or o.tipo = 'Chamado Fortics')
    group by o.sgp_contrato_id
    having count(*) >= p_minimo
  )
  select b.contrato_id, b.sgp_contrato_id, b.status, b.sgp_cliente_id, b.cliente, b.telefone,
         b.plano, b.pop, b.valor, b.corporativo, b.ativacao, s.chamados, s.tipos, s.ultimo
  from prevencao_base() b
  join s on s.sgp_contrato_id = b.sgp_contrato_id
  where b.status = 'ativo'
$$;

revoke all on function public.prevencao_base() from public, anon, authenticated;
revoke all on function public.prevencao_debito(int) from public, anon, authenticated;
revoke all on function public.prevencao_insatisfacao(int, int) from public, anon, authenticated;
grant execute on function public.prevencao_base() to service_role;
grant execute on function public.prevencao_debito(int) to service_role;
grant execute on function public.prevencao_insatisfacao(int, int) to service_role;
notify pgrst, 'reload schema';
