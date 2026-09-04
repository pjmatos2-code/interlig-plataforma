-- 0081: leitura global do perfil "direcao" (decisão do gestor, 03/09/2026).
--
-- Direção enxerga tudo que a operação enxerga — todos os times, todas as
-- competências — e não grava NADA: nenhuma política de insert/update/delete
-- menciona o perfil, então qualquer ação é recusada pelo banco mesmo que um
-- botão apareça na tela. Fora do escopo de leitura: integracoes_config
-- (segredos), szchat_eventos_brutos e integracoes_amostras (payloads crus),
-- sz_* (operacional de integração) e notificacoes (pessoais por usuário).

create or replace function app.eh_direcao() returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from usuarios u
     where u.id = auth.uid() and u.ativo and u.perfil = 'direcao'
   ) $$;

comment on function app.eh_direcao() is
  'Direção: leitura de todos os módulos, sem qualquer escrita (0081).';

do $$
declare t text;
begin
  foreach t in array array[
    'aditivos', 'ajustes_tecnica', 'bairros_geo', 'calendario', 'casos_retencao',
    'clientes', 'comissao_competencia_config', 'comissao_liberacoes',
    'comissao_sgp_itens', 'comissoes_fechadas', 'comissoes_fechadas_historico',
    'contratos', 'debitos_meta_mensal', 'gerencia_config', 'metas',
    'motivos_nao_conversao', 'origem_map', 'os_instalacao', 'os_tecnicas',
    'planos', 'pops', 'regras_comissao', 'sync_runs', 'tecnicos',
    'ticket_acoes', 'ticket_eventos', 'ticket_propostas', 'tickets',
    'titulos', 'usuarios', 'vendedores', 'visitas_externas'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_sel_direcao', t);
    execute format(
      'create policy %I on %I for select to authenticated using (app.eh_direcao())',
      t || '_sel_direcao', t
    );
  end loop;
end $$;
