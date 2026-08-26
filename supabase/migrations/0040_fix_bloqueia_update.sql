-- 0040: bloqueia_exclusao devolvia OLD tambem em UPDATE de gestor, o que
-- silenciosamente DESCARTAVA a alteracao (BEFORE UPDATE retornando OLD mantem
-- a linha antiga). Para UPDATE de gestor, o certo e devolver NEW.
create or replace function app.bloqueia_exclusao() returns trigger
language plpgsql as $$
begin
  if app.eh_gestor() then
    if tg_op = 'UPDATE' then
      return new; -- aplica a alteracao administrativa
    end if;
    return old; -- DELETE/TRUNCATE do gestor prosseguem
  end if;
  raise exception 'Registro de % não pode ser excluído (PRD 3.9).', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;
