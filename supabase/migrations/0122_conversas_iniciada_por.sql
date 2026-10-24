-- 0122 — Performance Comercial: quem abriu a conversa (24/10/2026). Aditiva.
-- cliente = receptivo (conta SLA de 1ª resposta); agente = contato ativo
-- (follow-up/prospecção, sem SLA); automacao = campanha/fluxo automático.
alter table public.conversas_atendimento
  add column if not exists iniciada_por text check (iniciada_por in ('cliente', 'agente', 'automacao'));
