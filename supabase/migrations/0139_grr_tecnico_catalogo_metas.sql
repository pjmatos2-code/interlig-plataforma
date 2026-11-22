-- 0139: GRR Técnico — catálogo e metas aprovados pela gestão em 21/11/2026
-- (documento "GRR Técnico: indicadores, metas e faixas").
--
-- Mesmas tabelas do comercial, com setor = 'tecnico'. A conta de cada
-- indicador está em lib/grr/tecnico/regras.ts. Percentuais vão de 0 a 1.
-- As metas valem a partir da semana de 16/11/2026 (primeira semana congelada
-- do setor, no fechamento de segunda 23/11). A tela do setor técnico lê pelo
-- servidor depois de conferir o perfil (gestor, direção e gestor técnico).

insert into grr.indicadores (empresa, setor, chave, ativo)
values
  ('interlig', 'tecnico', 'tec_instalacoes', true),
  ('interlig', 'tecnico', 'tec_instalacao_48h', true),
  ('interlig', 'tecnico', 'tec_suporte_24h', true),
  ('interlig', 'tecnico', 'tec_corporativo_4h', true),
  ('interlig', 'tecnico', 'tec_mudanca_24h', true),
  ('interlig', 'tecnico', 'tec_retorno_7d', true),
  ('interlig', 'tecnico', 'tec_agendamentos_vencidos', true),
  ('interlig', 'tecnico', 'tec_falta_validar', true),
  ('interlig', 'tecnico', 'tec_os_para_baixar', true)
on conflict (empresa, setor, chave) do nothing;

-- metas da empresa
insert into grr.metas (empresa, setor, indicador, escopo_tipo, escopo_ref, vigente_desde, meta, limite_atencao, observacao)
select 'interlig', 'tecnico', m.indicador, 'empresa', null, date '2026-11-16', m.meta, m.limite, m.obs
from (values
  ('tec_instalacoes', 308::numeric, 262::numeric, 'Meta do mês (308 = 71 por semana); a semana recebe a parte dos dias úteis. Aprovada em 21/11/2026.'),
  ('tec_instalacao_48h', 0.80, 0.65, 'Do direcionamento ao gestor técnico até o contrato ativo. Aprovada em 21/11/2026.'),
  ('tec_suporte_24h', 0.75, 0.60, 'Aprovada em 21/11/2026.'),
  ('tec_corporativo_4h', 0.60, 0.40, '1º degrau (até 90%), revisto todo mês pela diretoria. Aprovada em 21/11/2026.'),
  ('tec_mudanca_24h', 0.40, 0.20, '1º degrau (até 80%), revisto todo mês pela diretoria. Da data agendada até a OS encerrada. Aprovada em 21/11/2026.'),
  ('tec_retorno_7d', 0.08, 0.12, 'Menor é melhor. Aprovada em 21/11/2026.'),
  ('tec_agendamentos_vencidos', 5, 15, 'Estoque no fechamento; meta só da empresa. Aprovada em 21/11/2026.'),
  ('tec_falta_validar', 10, 40, 'Estoque no fechamento; meta só da empresa. Aprovada em 21/11/2026.'),
  ('tec_os_para_baixar', 5, 20, 'Estoque no fechamento; meta só da empresa. Aprovada em 21/11/2026.')
) as m(indicador, meta, limite, obs)
where not exists (
  select 1 from grr.metas x where x.empresa = 'interlig' and x.setor = 'tecnico' and x.indicador = m.indicador and x.escopo_tipo = 'empresa'
);

-- instalações por unidade (meta do mês): Altamira 248, Vitória do Xingu e Brasil Novo 30 cada
insert into grr.metas (empresa, setor, indicador, escopo_tipo, escopo_ref, vigente_desde, meta, limite_atencao, observacao)
select 'interlig', 'tecnico', 'tec_instalacoes', 'unidade', p.id, date '2026-11-16', u.meta, u.limite, 'Meta do mês; a semana recebe a parte dos dias úteis. Aprovada em 21/11/2026.'
from (values ('Altamira', 248::numeric, 211::numeric), ('Vitória do Xingu', 30, 26), ('Brasil Novo', 30, 26)) as u(nome, meta, limite)
join public.pops p on p.nome = u.nome
where not exists (
  select 1 from grr.metas x where x.empresa = 'interlig' and x.setor = 'tecnico' and x.indicador = 'tec_instalacoes' and x.escopo_tipo = 'unidade' and x.escopo_ref = p.id
);
