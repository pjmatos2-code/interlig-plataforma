-- 0142: GRR Técnico — turmas de instalação (21/11/2026).
-- "OS da semana instaladas na semana": das OS de instalação criadas na semana,
-- quantas tiveram o contrato do mesmo cliente ativado até o fim da semana.
-- "Clientes deixados para trás": OS de instalação das 8 semanas anteriores
-- ainda sem ativação (nem cancelamento) no fim da semana. Conta em
-- lib/grr/tecnico/regras.ts. Metas propostas em 21/11/2026; valem a partir da
-- semana de 16/11.
insert into grr.indicadores (empresa, setor, chave, ativo)
values ('interlig', 'tecnico', 'tec_instalacoes_vs_os', true), ('interlig', 'tecnico', 'tec_deixados_para_tras', true)
on conflict (empresa, setor, chave) do nothing;

insert into grr.metas (empresa, setor, indicador, escopo_tipo, escopo_ref, vigente_desde, meta, limite_atencao, observacao)
select 'interlig', 'tecnico', m.indicador, 'empresa', null, date '2026-11-16', m.meta, m.limite, m.obs
from (values
  ('tec_instalacoes_vs_os', 0.80::numeric, 0.65::numeric, 'Aprovada em 21/11/2026.'),
  ('tec_deixados_para_tras', 0, 0, 'Meta zero: qualquer cliente deixado para trás fica vermelho (decisão da gestão). Só da empresa. Aprovada em 21/11/2026.')
) as m(indicador, meta, limite, obs)
where not exists (select 1 from grr.metas x where x.empresa = 'interlig' and x.setor = 'tecnico' and x.indicador = m.indicador and x.escopo_tipo = 'empresa');
