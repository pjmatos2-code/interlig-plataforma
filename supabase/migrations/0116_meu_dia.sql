-- 0116: Meu Dia — Comercial Interno (14/10/2026). Piloto em Altamira
-- (Damely e Karoline). Decisões do gestor:
--   * pendentes 90+ só contam clientes que chegaram a ser instalados;
--   * meta do dia = ceil((meta do mês − realizado) / dias úteis restantes);
--   * sem ranking (há módulo próprio); indicação simples, sem auditoria.
-- Retorno agendado (tickets.followup_em) e lembrete (ticket_acoes) seguem
-- como estão e são unificados na EXIBIÇÃO da sub-fila de follow-up.

-- quem está no piloto (a tela abre ao entrar e o menu aparece)
alter table public.vendedores add column if not exists meu_dia boolean not null default false;
update public.vendedores set meu_dia = true where ativo and nome in ('Damely', 'Karoline');

-- indicação vira ticket próprio, ligado ao contrato de quem indicou
alter type public.origem_criacao_ticket add value if not exists 'indicacao';
alter table public.tickets
  add column if not exists indicado_por_contrato_id uuid references public.contratos(id) on delete set null;

-- log de toda ação manual do Meu Dia (e das ações do CRM que concluem missões)
create table if not exists public.meu_dia_log (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.usuarios(id) on delete set null,
  vendedor_id uuid references public.vendedores(id) on delete set null,
  ticket_id uuid references public.tickets(id) on delete set null,
  contrato_id uuid references public.contratos(id) on delete set null,
  acao text not null,
  resultado text,
  motivo text,
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists meu_dia_log_vendedor_idx on public.meu_dia_log (vendedor_id, criado_em desc);

-- Bloco 4: pós-venda dos contratos ativados no dia anterior (job 00h05)
create table if not exists public.meu_dia_posvenda (
  contrato_id uuid primary key references public.contratos(id) on delete cascade,
  vendedor_id uuid not null references public.vendedores(id) on delete cascade,
  ativado_em date not null,
  boas_vindas_em timestamptz,
  resultado text check (resultado in ('indicou', 'sem_indicacao')),
  resultado_em timestamptz,
  ticket_indicado_id uuid references public.tickets(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists meu_dia_posvenda_pendentes_idx
  on public.meu_dia_posvenda (vendedor_id) where resultado is null;

-- Bloco 5: pendentes 90+ recalculados por dia (job 00h05)
create table if not exists public.meu_dia_diario (
  vendedor_id uuid not null references public.vendedores(id) on delete cascade,
  data date not null,
  pendentes_90 integer not null default 0,
  pendentes_lista jsonb not null default '[]'::jsonb,
  calculado_em timestamptz not null default now(),
  primary key (vendedor_id, data)
);

-- sem policy: lido e gravado só pelo servidor, depois de conferir o usuário
alter table public.meu_dia_log enable row level security;
alter table public.meu_dia_posvenda enable row level security;
alter table public.meu_dia_diario enable row level security;
notify pgrst, 'reload schema';
