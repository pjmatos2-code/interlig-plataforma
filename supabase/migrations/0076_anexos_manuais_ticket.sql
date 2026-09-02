-- 0076: complemento manual da visita pelo ticket do CRM — prospecção lançada
-- da base (fora do local): fotos e endereço informados pelo cliente depois.
alter table visitas_externas alter column foto_casa_path drop not null;
alter table visitas_externas add column if not exists endereco_manual text;
