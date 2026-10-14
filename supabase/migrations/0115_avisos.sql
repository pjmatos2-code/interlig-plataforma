-- 0115: Avisos (14/10/2026) — o gestor escreve um aviso e direciona para
-- perfis/equipes, unidades ou pessoas; quem recebe vê um popup em qualquer
-- tela e só fecha confirmando a leitura. Os destinatários são gravados na
-- criação (quem entrar depois não recebe avisos antigos) e a confirmação fica
-- na própria linha do destinatário.
create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) between 3 and 120),
  mensagem text not null check (length(trim(mensagem)) between 3 and 4000),
  importancia text not null default 'normal' check (importancia in ('normal', 'importante')),
  -- o que foi escolhido no formulário (para exibir "Para: …")
  alvo jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  criado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now()
);

create table if not exists public.avisos_destinatarios (
  aviso_id uuid not null references public.avisos(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  lido_em timestamptz,
  primary key (aviso_id, usuario_id)
);
create index if not exists avisos_destinatarios_pendentes_idx
  on public.avisos_destinatarios (usuario_id) where lido_em is null;

-- sem policy: lido e gravado só pelo servidor, depois de conferir o usuário
alter table public.avisos enable row level security;
alter table public.avisos_destinatarios enable row level security;
notify pgrst, 'reload schema';
