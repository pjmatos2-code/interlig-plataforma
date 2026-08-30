-- 0053: Setor de Atendimento — refidelização de planos.
--
-- Duas agentes (Talia e Myllena) são comissionadas por renovação de fidelidade
-- e upgrade de plano, registrados como ADITIVOS no SGP. Regras definidas com a
-- gestão em 30/08/2026:
--
--  · só conta aditivo APROVADO no SGP e com as DUAS assinaturas no SGPsign
--    (cliente e provedor) — o "aprovado" sozinho não serve, porque hoje a
--    própria agente aprova o que gera;
--  · a base é o VTV (valor mensal) dos planos refidelizados, NÃO o desconto:
--    o desconto é o benefício dado em troca da fidelidade;
--  · "Mudança de Plano" conta, porque o upgrade aumenta o ticket do cliente;
--  · contrato corporativo conta, pelo valor mensal;
--  · sem critério de qualidade: cliente que cancela depois vai para Retenção,
--    que é outro setor.
create table if not exists aditivos (
  id                    uuid primary key default gen_random_uuid(),
  sgp_aditivo_id        text not null unique,
  sgp_contrato_id       text,
  contrato_id           uuid references contratos(id) on delete set null,
  cliente_nome          text,
  agente_login          text not null,          -- usuário do SGP que gerou
  tipo                  text not null,          -- Fidelidade, Mudança de Plano...
  descricao             text,                   -- "800MB - RENOVAÇÃO FIDELIDADE - DESC. R$ 20,00"
  plano_rotulo          text,                   -- 400MB / 800MB / 1GB
  desconto              numeric(12,2) default 0,-- informativo: não entra na base
  valor_mensal          numeric(12,2) default 0,-- VTV normalizado (base da comissão)
  data_aditivo          date not null,
  status_sgp            text,                   -- Aprovado / Pendente
  assinatura_cliente    boolean not null default false,
  assinatura_provedor   boolean not null default false,
  finalizado            boolean not null default false,
  /* gestor pode liberar/reprovar à mão, como nos outros módulos */
  decisao               text check (decisao in ('aprovado','reprovado')),
  decisao_motivo        text,
  decisao_por           uuid references usuarios(id) on delete set null,
  decisao_em            timestamptz,
  sincronizado_em       timestamptz not null default now()
);

create index if not exists idx_aditivos_data on aditivos (data_aditivo);
create index if not exists idx_aditivos_agente on aditivos (agente_login, data_aditivo);

alter table aditivos enable row level security;

create policy aditivos_adm on aditivos for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

-- a agente vê os próprios aditivos (é a lista de pendências dela)
create policy aditivos_sel on aditivos for select to authenticated
  using (
    app.eh_gestor()
    or app.eh_financeiro()
    or exists (
      select 1 from vendedores v
      join usuarios u on u.vendedor_id = v.id
      where u.id = auth.uid() and lower(v.sgp_login) = lower(aditivos.agente_login)
    )
  );

comment on table aditivos is
  'Aditivos do SGP (refidelização e upgrade). Comissiona quem gerou, desde que aprovado e com as duas assinaturas no SGPsign — ver lib/refidelizacao.';
