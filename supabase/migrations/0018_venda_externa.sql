-- =====================================================================
-- 0018: módulo de VENDA EXTERNA (PAP) — registro de visita em campo
-- Cada visita cria um ticket normal do CRM + este anexo com fotos e GPS.
-- Fotos ficam em bucket PRIVADO (documento é dado sensível / LGPD);
-- a leitura é sempre por URL assinada.
-- =====================================================================
create table visitas_externas (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references tickets(id) on delete restrict,
  vendedor_id     uuid references vendedores(id) on delete set null,
  foto_casa_path  text not null,
  foto_doc_path   text,
  lat             double precision,
  lng             double precision,
  precisao_m      double precision,
  criado_em       timestamptz not null default now(),
  criado_por      uuid references usuarios(id) on delete set null
);
create index visitas_externas_ticket_idx on visitas_externas (ticket_id);
create index visitas_externas_vend_idx on visitas_externas (vendedor_id, criado_em desc);

alter table visitas_externas enable row level security;

-- visível para quem enxerga o ticket (mesma lógica do CRM)
create policy visitas_sel on visitas_externas for select to authenticated
  using (exists (select 1 from tickets t where t.id = visitas_externas.ticket_id));

create policy visitas_ins on visitas_externas for insert to authenticated
  with check (criado_por is not distinct from auth.uid());

-- registro de campo é histórico: não se apaga nem se altera
create trigger visitas_sem_delete before delete on visitas_externas
  for each row execute function app.bloqueia_exclusao();
create trigger visitas_sem_update before update on visitas_externas
  for each row execute function app.bloqueia_exclusao();

-- bucket privado das fotos
insert into storage.buckets (id, name, public) values ('venda-externa', 'venda-externa', false)
on conflict (id) do nothing;
