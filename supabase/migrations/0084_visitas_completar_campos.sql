-- 0084: completar a visita externa não é reescrever o histórico.
--
-- O gatilho visitas_sem_update usava app.bloqueia_exclusao() e barrava
-- QUALQUER edição (menos gestor logado) — inclusive o caso legítimo da rua:
-- visita registrada sem todos os anexos e o cliente fecha no retorno; a
-- agente/coordenador ia completar o documento e recebia "não pode ser
-- excluído" (relato do gestor, 04/09/2026).
--
-- Regra nova: campo VAZIO pode ser preenchido por qualquer perfil autorizado
-- (a ação valida o dono do ticket); campo JÁ PREENCHIDO só o gestor altera.
-- A imutabilidade do que foi coletado em campo continua garantida.

create or replace function app.visitas_so_completa() returns trigger
language plpgsql as $$
begin
  if app.eh_gestor() then
    return new; -- correção administrativa continua liberada
  end if;
  if (old.ticket_id      is distinct from new.ticket_id)
     or (old.vendedor_id  is not null and old.vendedor_id  is distinct from new.vendedor_id)
     or (old.setor        is distinct from new.setor)
     or (old.criado_em    is distinct from new.criado_em)
     or (old.criado_por   is distinct from new.criado_por)
     or (old.lat          is not null and old.lat          is distinct from new.lat)
     or (old.lng          is not null and old.lng          is distinct from new.lng)
     or (old.precisao_m   is not null and old.precisao_m   is distinct from new.precisao_m)
     or (old.foto_casa_path      is not null and old.foto_casa_path      is distinct from new.foto_casa_path)
     or (old.foto_doc_path       is not null and old.foto_doc_path       is distinct from new.foto_doc_path)
     or (old.foto_doc_verso_path is not null and old.foto_doc_verso_path is distinct from new.foto_doc_verso_path)
     or (old.endereco_manual     is not null and old.endereco_manual     is distinct from new.endereco_manual)
  then
    raise exception 'Visita de campo é histórico: só é permitido completar campos vazios (PRD 3.9).'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists visitas_sem_update on visitas_externas;
create trigger visitas_sem_update before update on visitas_externas
  for each row execute function app.visitas_so_completa();
