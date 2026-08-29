-- 0048: liga/desliga o débito de inadimplentes por competência.
--
-- Contexto (29/08/2026): no início de agosto as vendedoras receberam o número
-- de pendentes calculado pela regra ANTIGA (janela móvel de 90 dias). A regra
-- por coorte M-3 entrou depois e mudou os números. Alterar a base de cálculo a
-- dois dias do fechamento penalizaria quem se programou pelo número anunciado,
-- então agosto/2026 fecha SEM débito e a regra nova passa a valer de setembro.
--
-- A decisão é da competência inteira (não caso a caso), por isso a chave vive
-- aqui e não em debitos_meta_mensal — que continua servindo ao ajuste manual
-- de uma vendedora específica.
create table if not exists comissao_competencia_config (
  competencia    date primary key,
  aplicar_debito boolean not null default true,
  observacao     text,
  definido_por   uuid references usuarios(id) on delete set null,
  definido_em    timestamptz not null default now()
);

alter table comissao_competencia_config enable row level security;

create policy comissao_comp_cfg_adm on comissao_competencia_config for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

-- todo mundo lê: a vendedora precisa saber se o débito conta no mês dela
create policy comissao_comp_cfg_sel on comissao_competencia_config for select to authenticated
  using (true);

comment on table comissao_competencia_config is
  'Parâmetros do fechamento por competência. aplicar_debito=false: a lista de pendentes continua visível para acompanhamento, mas não desconta da meta.';

-- agosto/2026: fecha sem débito (decisão da gestão)
insert into comissao_competencia_config (competencia, aplicar_debito, observacao)
values ('2026-08-01', false,
        'Transição de regra: as pendências foram anunciadas em 01/08 pela janela de 90 dias; a coorte M-3 entrou em 28/08. Agosto fecha sem débito para não penalizar quem se programou pelo número original.')
on conflict (competencia) do nothing;
