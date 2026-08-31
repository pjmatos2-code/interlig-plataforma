-- 0063: análise de follow-up por IA no ticket do CRM.
--
-- O analista lê a conversa do SZ vinculada ao ticket e grava aqui o resultado:
-- {interesse, situacao, pendencia, proxima_acao, quando}. A agente vê no
-- próprio ticket o que fazer em seguida — em vez de reler a conversa inteira.
alter table tickets
  add column if not exists analise_followup jsonb,
  add column if not exists followup_analisado_em timestamptz;

comment on column tickets.analise_followup is
  'Follow-up gerado pelo analista de conversas (IA) a partir do transcript do SZ. Sugestão para a agente, não decisão.';
