-- 0141: GRR Técnico — indicador "Agendamentos cumpridos no dia" (21/11/2026).
-- Das OS agendadas para a semana e já vencidas, quantas tiveram o técnico no
-- local (check-in) até o fim do dia marcado. Meta e atenção aprovadas pela
-- gestão em 21/11/2026; vale a partir da semana de 16/11. A conta está em
-- lib/grr/tecnico/regras.ts (situacaoAgenda). O quadro por técnico usa a mesma
-- faixa (sem farol abaixo de 10 OS na semana).
insert into grr.indicadores (empresa, setor, chave, ativo)
values ('interlig', 'tecnico', 'tec_agenda_no_dia', true)
on conflict (empresa, setor, chave) do nothing;

insert into grr.metas (empresa, setor, indicador, escopo_tipo, escopo_ref, vigente_desde, meta, limite_atencao, observacao)
select 'interlig', 'tecnico', 'tec_agenda_no_dia', 'empresa', null, date '2026-11-16', 0.95, 0.90, 'Aprovada em 21/11/2026.'
where not exists (select 1 from grr.metas where empresa = 'interlig' and setor = 'tecnico' and indicador = 'tec_agenda_no_dia' and escopo_tipo = 'empresa');
