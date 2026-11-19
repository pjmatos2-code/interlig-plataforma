# GRR: Reunião Semanal da Equipe Comercial

Situação: desenvolvida na branch `feat/grr-reuniao-equipe`. Depende da migração `0135_grr_reunioes.sql` (ainda não aplicada).

## O que é

Segunda modalidade de reunião do GRR, conduzida pela coordenação com os agentes, normalmente aos sábados. A reunião de resultados da diretoria (segunda) não muda: continua no Relatório da diretoria e no Modo Apresentação de `/apresentacao/grr`.

## Funcionamento

- `/grr/reunioes`: as duas modalidades; criar reunião de equipe (equipe ou unidade, data, período de referência) e a lista das reuniões do recorte de quem abre.
- `/grr/reunioes/[id]`: indicadores da equipe por agente, compromissos da reunião anterior (com a situação), compromissos desta reunião, participantes, observações, boas práticas, encerramento e correções.
- `/apresentacao/grr/reuniao/[id]`: Modo Apresentação em dez seções, com a mesma moldura da reunião da diretoria (teclado, tela cheia, sumário).

Indicadores por equipe e por agente: vendas contra a meta, conversão por safra, leads recebidos e atendidos, ticket médio, vendas ativadas e pendências (sem assinatura, aguardando instalação), motivos de perda, follow-ups vencidos e a fazer, e a evolução em relação à semana anterior. Tudo sai de `lib/grr/montar.ts` (as mesmas listas do painel; os números por agente somam os totais). A receita por agente não aparece na reunião (dado financeiro). Inadimplência inicial e churn precoce ficam como bloco complementar, previsto na Etapa 5.

## Compromissos

- Operacional: dentro da autonomia da coordenação, acompanhado por ela, sem aprovação.
- Gerencial (investimento, política, fora da autonomia): nasce aguardando a diretoria; só direção e administração aprovam, pedem ajuste ou rejeitam.
- Compromisso não se apaga (cancelado); cada mudança de situação ou aprovação fica registrada.

## Encerramento e histórico

Ao encerrar, a reunião guarda a foto dos indicadores (com metas e comparativos), os participantes, as observações, as boas práticas, os compromissos e a conferência dos anteriores. A reunião encerrada não muda; correções entram como registros à parte. A lista de reuniões permite consultar as anteriores.

## Banco (migração 0135)

`grr.reunioes` (com a modalidade `equipe` e, prevista, `diretoria`), `grr.compromissos` e `grr.reuniao_registros`, no esquema `grr`, com visões `public.grr_*`. Nenhuma tabela existente muda. Ensaio com transação desfeita: 27 conferências de permissão e integridade.

Permissões: direção e administração veem todas; a coordenação vê, cria, conduz e encerra só as da própria equipe (ou da unidade, para quem não coordena equipe); agentes não acessam por enquanto.

## Pendências

- Acesso dos agentes aos próprios indicadores e compromissos (muda a regra atual de que agentes não acessam o GRR).
- Fila de compromissos gerenciais aguardando a diretoria fora da página da reunião (Etapa 3).
- Inadimplência e churn (Etapa 5).
