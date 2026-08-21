-- =====================================================================
-- Migração 0007: captura bruta dos eventos do SZ Chat (descoberta do payload)
-- Toda chamada ao webhook é registrada aqui, dando ou não em ticket — é a
-- ferramenta para mapear o formato real do webhook nativo do SZ.
-- =====================================================================
create table szchat_eventos_brutos (
  id           uuid primary key default gen_random_uuid(),
  recebido_em  timestamptz not null default now(),
  metodo       text,
  content_type text,
  headers      jsonb,
  corpo        jsonb,
  resultado    text,
  ticket_id    uuid
);

create index szchat_eventos_brutos_idx on szchat_eventos_brutos (recebido_em desc);

alter table szchat_eventos_brutos enable row level security;
-- só o gestor lê (para inspecionar na tela de integrações)
create policy szchat_brutos_sel on szchat_eventos_brutos for select to authenticated
  using (app.eh_gestor());
-- escrita: apenas service role (o webhook)
