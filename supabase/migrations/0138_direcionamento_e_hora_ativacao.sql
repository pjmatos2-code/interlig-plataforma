-- 0138: prazo real de instalação (21/11/2026).
--
-- Decisão da gestão: o prazo de instalação conta do momento em que a
-- ocorrência de instalação é DIRECIONADA ao gestor técnico (depois das
-- assinaturas, o "Usuário responsável" da ocorrência passa a ser o gestor da
-- unidade) até o contrato passar de inativo para ativo. Meta: 48 h, a mesma
-- para mudança de endereço.
--
-- (1) O momento do direcionamento só existe no registro de alterações da
-- página de cada ocorrência no SGP. A plataforma lê esse registro (só leitura)
-- e guarda aqui a primeira vez que o responsável foi preenchido.
alter table public.ocorrencias_sgp
  add column if not exists responsavel text,
  add column if not exists direcionada_em timestamptz,
  add column if not exists direcionada_para text,
  add column if not exists direcionamento_origem text check (direcionamento_origem in ('registro', 'abertura')),
  add column if not exists direcionamento_lido_em timestamptz;
comment on column public.ocorrencias_sgp.responsavel is 'Usuário responsável atual da ocorrência no SGP (coluna do relatório).';
comment on column public.ocorrencias_sgp.direcionada_em is 'Primeira vez que o usuário responsável foi preenchido, lida do registro de alterações da ocorrência no SGP.';
comment on column public.ocorrencias_sgp.direcionamento_origem is 'registro: hora tirada do registro de alterações; abertura: o responsável já veio na abertura (vale a hora de criação).';
create index if not exists ocorrencias_sgp_direcionar_idx on public.ocorrencias_sgp (criada_em)
  where direcionada_em is null and responsavel is not null;

-- (2) Hora da ativação. data_ativacao é só o dia. A partir de agora, quando o
-- contrato sai de "aguardando ativação"/"pendente de assinatura" para "ativo",
-- o banco carimba a hora em que a plataforma viu a mudança (o sync confere a
-- cada ~5 min). Vale para qualquer caminho de gravação. Contrato já ativo
-- antes desta migração fica sem hora (o histórico segue pelo dia).
alter table public.contratos add column if not exists ativado_em timestamptz;
comment on column public.contratos.ativado_em is 'Hora em que a plataforma viu o contrato passar de inativo para ativo (desde 21/11/2026). Antes disso só há data_ativacao.';

create or replace function public.contratos_carimba_ativacao() returns trigger
language plpgsql as $$
begin
  if new.status = 'ativo' and old.status in ('aguardando_ativacao', 'pendente_assinatura') and new.ativado_em is null then
    new.ativado_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists contratos_carimba_ativacao on public.contratos;
create trigger contratos_carimba_ativacao before update of status on public.contratos
  for each row execute function public.contratos_carimba_ativacao();

notify pgrst, 'reload schema';
