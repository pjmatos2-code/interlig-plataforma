-- =====================================================================
-- 0102: ticket fechado pode RECEBER vendedora quando estava vazio
-- (01/10/2026).
--
-- O ticket automático da venda no SGP às vezes nasce um instante antes de o
-- leitor de painel identificar a vendedora e ficava órfão para sempre: a
-- trava de imutabilidade bloqueava até o preenchimento. Preencher (NULL →
-- vendedora) é completar a reconciliação; TROCAR uma vendedora já gravada
-- continua proibido sem reabrir o ticket.
-- =====================================================================

create or replace function app.ticket_antes_de_gravar()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp' as $$
begin
  new.atualizado_em := now();

  -- primeira tratativa = primeira saída de "novo" (regra 5.15)
  if new.etapa <> 'novo' and new.primeira_tratativa_em is null then
    new.primeira_tratativa_em := now();
  end if;

  if tg_op = 'UPDATE' then
    -- Ticket fechado é imutável, exceto reabertura explícita, reconciliação
    -- com o SGP e o preenchimento de vendedora que estava vazia (PRD 3.9).
    if old.etapa = 'fechado' and new.etapa = 'fechado' then
      if new.desfecho    is distinct from old.desfecho
      or new.motivo_id   is distinct from old.motivo_id
      or new.plano_id    is distinct from old.plano_id
      or new.fechado_em  is distinct from old.fechado_em
      or (new.vendedor_id is distinct from old.vendedor_id and old.vendedor_id is not null) then
        raise exception 'Ticket fechado não pode ser alterado. Reabra o ticket para tratar de novo (PRD 3.9).'
          using errcode = 'restrict_violation';
      end if;
    end if;

    -- Reabertura limpa o desfecho para o fechamento voltar a ser obrigatório.
    if old.etapa = 'fechado' and new.etapa <> 'fechado' then
      new.desfecho    := null;
      new.fechado_em  := null;
      new.fechado_por := null;
      new.motivo_id   := null;
    end if;
  end if;

  if new.etapa = 'fechado' and new.fechado_em is null then
    new.fechado_em := now();
  end if;

  return new;
end;
$$;
