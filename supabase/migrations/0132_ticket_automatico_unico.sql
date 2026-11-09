-- =====================================================================
-- 0132: um ticket automático (sgp_auto) por contrato (09/11/2026).
--
-- Entre 05/11 e 09/11 a rotina que cria o ticket da venda feita direto no
-- SGP lia só os primeiros 1.000 tickets da janela e não via o automático
-- que já existia: criava outro a cada leitura (cron de 5 min e cada
-- abertura do /crm). Ficaram 9 vendas com 2 a 19 tickets iguais, todos
-- "convertidos": a venda aparecia repetida no CRM da vendedora e contava
-- várias vezes na conversão. A rotina foi corrigida em e72dc59.
--
-- 1) Limpeza: em cada contrato que só tem tickets sgp_auto, fica um — o
--    que tem interação de alguém; senão o que tem vendedora; senão o mais
--    antigo. Sai só quem não tem nada apontando para ele (nota de pessoa,
--    proposta, visita, ação, consulta de crédito, Meu Dia, conversa,
--    follow-up, alerta, reabertura). Os avisos "Novo ticket no CRM" dos
--    que saem são marcados como lidos (não apagados). Em produção, a cópia
--    das linhas apagadas foi guardada fora do banco antes (script
--    limpar-tickets-repetidos.mjs, na pasta de backups).
-- 2) Trava: índice único parcial. Duas execuções da rotina ao mesmo tempo
--    (cron + abertura do /crm) não conseguem mais criar dois automáticos
--    para o mesmo contrato: a segunda gravação falha e a rotina segue.
--
-- Tudo numa transação: se sobrar repetido com interação, o índice falha e
-- nada é apagado.
-- =====================================================================

create temporary table _sgp_auto_repetidos on commit drop as
with autos as (
  select
    t.id, t.contrato_id, t.criado_em, t.vendedor_id,
    (   exists (select 1 from ticket_eventos x where x.ticket_id = t.id and x.usuario_id is not null)
     or exists (select 1 from ticket_propostas x where x.ticket_id = t.id)
     or exists (select 1 from visitas_externas x where x.ticket_id = t.id)
     or exists (select 1 from ticket_acoes x where x.ticket_id = t.id)
     or exists (select 1 from consultas_credito x where x.ticket_id = t.id)
     or exists (select 1 from credito_prosseguimentos x where x.ticket_id = t.id)
     or exists (select 1 from meu_dia_log x where x.ticket_id = t.id)
     or exists (select 1 from meu_dia_posvenda x where x.ticket_indicado_id = t.id)
     or exists (select 1 from conversas_atendimento x where x.ticket_id = t.id)
     or exists (select 1 from analises_conversa x where x.ticket_id = t.id)
     or exists (select 1 from followups x where x.ticket_id = t.id)
     or exists (select 1 from alertas_comerciais x where x.ticket_id = t.id)
     or exists (select 1 from tickets x where x.reaberto_de_id = t.id)
    ) as mexido
  from tickets t
  where t.origem_criacao = 'sgp_auto'
    and t.contrato_id is not null
    and not exists (
      select 1 from tickets r
      where r.contrato_id = t.contrato_id and r.origem_criacao <> 'sgp_auto'
    )
),
ordem as (
  select a.*,
    row_number() over (
      partition by a.contrato_id
      order by a.mexido desc, (a.vendedor_id is not null) desc, a.criado_em, a.id
    ) as posicao
  from autos a
)
select id from ordem where posicao > 1 and not mexido;

-- ---- apaga ----

select set_config('app.exclusao_sistema', 'on', true);
delete from ticket_eventos where ticket_id in (select id from _sgp_auto_repetidos);
delete from tickets where id in (select id from _sgp_auto_repetidos);
select set_config('app.exclusao_sistema', 'off', true);

update notificacoes set lida = true
where lida = false
  and link in (select '/crm/' || id from _sgp_auto_repetidos);

create unique index if not exists tickets_sgp_auto_um_por_contrato
  on tickets (contrato_id)
  where origem_criacao = 'sgp_auto';
