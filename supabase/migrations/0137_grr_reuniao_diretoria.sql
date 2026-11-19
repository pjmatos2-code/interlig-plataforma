-- GRR, Etapa 4 (19/11/2026): reunião de resultados da diretoria no GRR.
--
-- A tabela de reuniões (0135) já previa a modalidade 'diretoria'. Aqui entram:
--  - a ata (`ata`): anotações de cada item da pauta e as decisões
--    (texto, responsável, prazo), editável enquanto a reunião está aberta e
--    congelada junto com a reunião no encerramento;
--  - a regra de que só a diretoria (direção e administração) encerra a
--    reunião de resultados (a reunião de equipe segue encerrada pela
--    coordenação, como na 0135).
-- Pauta fixa, na ordem da especificação: indicadores e resultados,
-- diagnósticos dos desvios, acompanhamento das ações anteriores, proposição e
-- aprovação de novas ações, decisões e encerramento.
--
-- Só acrescenta uma coluna e troca a função do gatilho de reuniões
-- (mesmas regras de antes, mais a do encerramento da diretoria).

alter table grr.reunioes add column if not exists ata jsonb not null default '{}'::jsonb;

create or replace function grr.reuniao_antes_de_gravar() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Reunião do GRR não pode ser excluída.' using errcode = 'restrict_violation';
  end if;
  if old.situacao = 'encerrada' then
    raise exception 'Reunião encerrada não pode ser alterada: registre uma correção.' using errcode = 'restrict_violation';
  end if;
  if new.modalidade <> old.modalidade or new.escopo_tipo <> old.escopo_tipo or new.escopo_ref is distinct from old.escopo_ref or new.empresa <> old.empresa then
    raise exception 'A modalidade e o recorte da reunião não mudam depois de criada.' using errcode = 'restrict_violation';
  end if;
  -- reunião de resultados: só a diretoria encerra
  if new.situacao = 'encerrada' and new.modalidade = 'diretoria' and current_user = 'authenticated'
     and coalesce((select app.perfil()::text), '') not in ('gestor', 'direcao') then
    raise exception 'Só a diretoria encerra a reunião de resultados.' using errcode = 'insufficient_privilege';
  end if;
  new.atualizada_em := now();
  return new;
end;
$$;

-- a visão pública passa a mostrar a coluna nova
create or replace view public.grr_reunioes with (security_invoker = true) as select * from grr.reunioes;

notify pgrst, 'reload schema';
