-- 0145: setor de Infraestrutura na Operação Técnica (23/11/2026).
--
-- A gestão separou a infraestrutura da rede (gestora: Juliana Trevisan) da
-- operação técnica de campo (instalação, mudança de endereço e suporte).
-- Vai para a Infraestrutura a ocorrência aberta no cliente interno "SETOR
-- INFRAESTRUTURA" (contrato 15139), a direcionada ao setor Infraestrutura no
-- SGP, ou com tipo "Infraestrutura - ..." (regra em lib/operacao/regras.ts).
--
-- (1) perfil novo: vê só o módulo Infraestrutura (e o InterChat)
alter type perfil_usuario add value if not exists 'gestor_infraestrutura';

-- (2) o módulo entra no acesso por usuário
alter table public.usuario_modulos drop constraint if exists usuario_modulos_modulo_check;
alter table public.usuario_modulos add constraint usuario_modulos_modulo_check check (modulo in ('operacao', 'grr_tecnico', 'grr_comercial', 'infraestrutura'));

-- (3) setor da ocorrência no SGP (só o de Infraestrutura é marcado, pela
-- leitura da Operação Técnica a cada ~15 min)
alter table public.ocorrencias_sgp add column if not exists setor_sgp text;
comment on column public.ocorrencias_sgp.setor_sgp is 'Setor da ocorrência no SGP quando ela é da Infraestrutura (marcado pela leitura da Operação Técnica).';

notify pgrst, 'reload schema';
