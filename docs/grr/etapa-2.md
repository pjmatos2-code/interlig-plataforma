# GRR, Etapa 2: metas, faixas e histórico

Situação: desenvolvida na branch `feat/grr-etapa-2`. A migração `0134_grr_metas_e_historico.sql` precisa ser aplicada antes da publicação do código.

## O que entra

1. **Conversão por safra de leads** (só no GRR). Dos leads que chegaram no período e foram atendidos, quantos viraram venda. Não conta venda lançada direto no SGP sem atendimento, junta tickets repetidos do mesmo lead (mesmo telefone ou mesmo contrato) e deixa de fora os motivos fora da conversão. A conversão oficial do CRM (regra 5.14) continua igual e aparece ao lado. Código em `lib/grr/safra.ts`.
2. **Catálogo de indicadores** (`lib/grr/catalogo.ts`): chave, grupo, unidade, polaridade (maior ou menor é melhor) e de onde vem a meta. Vendas, instalações paradas e assinatura seguem as regras da plataforma; os demais recebem meta no GRR.
3. **Metas e faixas** (`/grr/configuracao`, só a administração): por indicador, liga ou desliga, define o dono, a meta e o limite de atenção, por empresa, unidade, equipe ou agente, a partir de uma semana. As metas não são editadas: cada mudança é uma linha nova com data de início, e o histórico fica visível. Taxas e ticket médio herdam a meta da empresa quando o recorte não tem a sua; volumes não herdam.
4. **Semana congelada** (foto): a administração e a direção congelam a última semana completa. O painel passa a mostrar os números guardados; "ver os números de agora" continua disponível. Corrigir uma semana congelada cria uma nova versão e exige o motivo. Nada é apagado.
5. **Histórico** (`/grr/historico`): semanas congeladas no recorte de quem abre, com versões, autor e motivo.

## Banco (migração 0134)

- Esquema próprio `grr`, com a chave `empresa` em todas as tabelas, para o módulo poder virar uma plataforma independente: `grr.empresas`, `grr.indicadores`, `grr.metas`, `grr.fotos`.
- Referências de recorte soltas (tipo + identificador), sem chave estrangeira para as tabelas do comercial.
- `grr.metas` e `grr.fotos` só aceitam inclusão (gatilho recusa alteração e exclusão).
- Permissão por linha: administração configura; direção e administração leem tudo e congelam; coordenação lê só a própria equipe ou unidade.
- Acesso pela API por três visões em `public` (`grr_indicadores`, `grr_metas`, `grr_fotos`) com `security_invoker`.
- Nenhuma tabela existente é alterada.

A migração foi ensaiada dentro de uma transação desfeita ao final (34 conferências de estrutura e permissão), sem deixar nada no banco.

## Sem a migração

O painel funciona como na Etapa 1; Configuração e Histórico avisam que as tabelas ainda não existem.

## Fora desta entrega

- Congelamento automático toda segunda-feira (proposto para depois).
- Foto mensal (a tabela já aceita).
- Reuniões, planos de ação e rotinas (Etapas 3 e 4); inadimplência e churn (Etapa 5).

## Verificações

Testes automatizados, tipos, lint e compilação de produção sem erros. Telas conferidas em 1280 e 390 px em prévia só de leitura (caminho sem as tabelas). Os formulários de meta e o congelamento só podem ser exercitados depois da migração.

## Fechamento automático (19/11/2026)

Toda segunda às 07:00 (Santarém), antes do Relatório da diretoria, o cron `/api/grr/fechamento` congela a última semana completa em todos os recortes, com origem "rotina" e sem autor. Se a semana já foi congelada (no painel ou no encerramento da reunião), não faz nada: o automático nunca cria uma segunda versão. A rota só aceita o `CRON_SECRET`.
