-- 0143: separação dos clientes deixados para trás (21/11/2026).
-- Decisão da gestão: o técnico responde só pelos clientes já aptos (contrato
-- assinado); os que esperam a assinatura vão para um indicador do setor
-- comercial: "Clientes deixados para trás por falta de assinatura" (vendas das
-- 8 semanas anteriores ainda sem assinar). Meta zero, como no técnico: qualquer
-- cliente fica vermelho. Vale a partir da semana de 16/11.
insert into grr.indicadores (empresa, setor, chave, ativo)
values ('interlig', 'comercial', 'clientes_sem_assinatura', true)
on conflict (empresa, setor, chave) do nothing;

insert into grr.metas (empresa, setor, indicador, escopo_tipo, escopo_ref, vigente_desde, meta, limite_atencao, observacao)
select 'interlig', 'comercial', 'clientes_sem_assinatura', 'empresa', null, date '2026-11-16', 0, 0, 'Meta zero (decisão da gestão em 21/11/2026).'
where not exists (select 1 from grr.metas where empresa = 'interlig' and setor = 'comercial' and indicador = 'clientes_sem_assinatura' and escopo_tipo = 'empresa');
