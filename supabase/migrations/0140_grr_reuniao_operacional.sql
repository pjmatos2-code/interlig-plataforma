-- 0140: reunião operacional do setor técnico (GRR Técnico, Etapa 2 — 21/11/2026).
--
-- A gestão decidiu que o setor técnico faz a sua reunião semanal às terças,
-- com o coordenador técnico e a equipe. Ela usa a mesma tabela das reuniões do
-- comercial (grr.reunioes), com setor 'tecnico' e a modalidade nova
-- 'operacional'; compromissos e registros também são os mesmos. As regras de
-- antes continuam: reunião não se apaga, encerrada não se altera, compromisso
-- de reunião encerrada só muda de situação. A tela do setor técnico grava pelo
-- servidor depois de conferir o perfil (gestor, direção e gestor técnico).
alter table grr.reunioes drop constraint if exists reunioes_modalidade_check;
alter table grr.reunioes add constraint reunioes_modalidade_check check (modalidade in ('equipe', 'diretoria', 'operacional'));
