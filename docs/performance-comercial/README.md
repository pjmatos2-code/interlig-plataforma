# Performance Comercial — entrega (Interlig Performance Intelligence)

Versão das regras **pc-1.0** · análise da IA **ia-1.1** · cálculo das conversas
**v2** · branch `performance-comercial` · 24/10/2026.

Documentos: [diagnóstico](diagnostico.md) · [indicadores e fórmulas](indicadores.md) ·
[dados pessoais (LGPD)](lgpd.md).

Legenda: ✅ implementado e testado · 🟡 implementado, depende de algo externo
para funcionar por completo · ⛔ não implementado (sem fonte de dados).

## 1. Arquitetura

- Menu **Performance Comercial** (`/performance`) dentro da plataforma, com o
  mesmo login e os mesmos perfis. Escopo aplicado no servidor em toda tela,
  ação e exportação (`lib/performance/escopo.ts`).
- **Coleta** das conversas comerciais do SZ Chat (conta robô, só leitura) →
  métricas por conversa calculadas na ingestão (`lib/performance/coleta`).
- **Apuração** em memória a partir de uma leitura do banco por período (cache de
  60 s), funções puras testadas (`lib/performance/dados`, `lib/performance/regras`).
- **Rotina própria** `/api/performance/rotina` (cron da Vercel a cada 10 min),
  fora do ciclo do `/api/sync` — que já não tem folga.
- **IA** atrás de uma interface de provedor (hoje Anthropic), saída validada por
  schema, desligada por padrão.

## 2. Telas

| Tela | Status | Observação |
|---|---|---|
| Visão geral (16 KPIs, evolução, funil, origem, ranking, ações) | ✅ | comparação com o período anterior equivalente e aviso de lacuna de coleta |
| Ranking (IPC, esforço, resultado, qualidade, conversão, vendas; diário/semanal/mensal) | ✅ | só comparáveis ganham posição |
| Esforço comercial (indicadores, distribuição por hora) | ✅ | |
| Perfil do vendedor ("o que fazer agora", carteira, oportunidades, tarefas, evolução, feedback, atividades) | ✅ | vendedor vê o próprio em "Meu desempenho" |
| Funil e conversão (coorte de entrada ou de fechamento, perdas, tempos, origem) | ✅ | |
| Follow-ups (fila, sugestões da IA, sem retorno, histórico) | ✅ | concluir/reprogramar passa pelas ações do CRM |
| Qualidade das vendas (coortes maduras) | ✅ | SVA e upsell: ⛔ sem dado |
| Inteligência das conversas (+ detalhe com evidências e revisão humana) | 🟡 | depende da análise por IA ligada |
| Alertas e oportunidades | ✅ | |
| Relatórios e metas (metas, projeção, afastamentos, rampa, 15 relatórios) | ✅ | |
| Configurações (status, rotinas sob demanda, regras, auditoria) | ✅ | só gestor |
| Versão para TV (`/tv/performance`) | ✅ | só números agregados |

## 3. APIs, rotinas e eventos

| Ponto | Uso | Autenticação |
|---|---|---|
| `GET /api/performance/exportar?relatorio=…&formato=xlsx\|csv&periodo=…` | exportação com os filtros da tela | sessão + escopo; vendedor não exporta; registra auditoria |
| `GET /api/performance/rotina` (`?aguardar=1` espera o resultado) | coleta, follow-ups, alertas, IA, fotografias diárias, limpeza de textos | `CRON_SECRET` |
| Server actions em `app/(app)/performance/acoes.ts` | follow-ups, alertas, metas, afastamentos, admissão, configurações, IA, rotinas manuais | sessão + escopo, auditadas |

A rotina grava cada etapa em `sync_runs` (`performance_coleta`,
`performance_followups`, `performance_alertas`, `performance_ia`,
`performance_recalculo`, `performance_diaria`) com status final — nunca
"executando", que faria o `/api/sync` pular a vez dele.

Eventos do chat: o SZ não tem webhook utilizável para mensagens; a coleta é por
leitura periódica do relatório de conversas encerradas (dia anterior até o fim
e o dia corrente), idempotente e retomável.

## 4. Banco (migrações aditivas)

| Migração | Conteúdo |
|---|---|
| 0121 | 13 tabelas novas (conversas, mensagens, análises, execuções da IA, follow-ups e histórico, alertas e eventos, fotografias, metas extras, afastamentos, configuração, auditoria) + coluna `vendedores.admitido_em`; RLS ligada sem política (acesso só pelo servidor) |
| 0122 | `conversas_atendimento.iniciada_por` (receptivo × ativo) |
| 0123 | `conversas_atendimento.cliente_por_dia` |
| 0124 | função `performance_mensagens_por_hora` (gráfico de atividade) |
| 0125 | constraint única `followups_chave_uk` (upsert idempotente) |
| 0126 | função `performance_assinatura_conversas` (fila da IA sem reanálise à toa) |

Nada existente foi alterado ou apagado. A tabela `avaliacoes_atendimento`
(migração 0119, de outro pedido, não usada) continua vazia e fora deste branch.

## 5. Fórmulas

Ver [indicadores.md](indicadores.md): esforço (8 itens), resultado (3),
qualidade (2 + 4 sinais de coorte), IPC 35/40/25, normalização, redistribuição de
pesos, cobertura, comparabilidade, funil, follow-ups, metas/projeção, alertas.

## 6. Fluxo da IA

1. A rotina enfileira conversas comerciais encerradas com ao menos 2 mensagens do
   cliente (`analises_conversa`, status pendente), com assinatura (total de
   mensagens + última) para não refazer o que não mudou.
2. Monta o prompt com a conversa **já mascarada**, as mensagens como dado não
   confiável (marcadores neutralizados, regra de sistema contra instruções
   embutidas), os planos reais do cadastro e a rubrica configurada.
3. `messages.parse` com schema (zod) → saneamento: enums, limites, evidências que
   apontam para mensagens que existem, plano só se for do cadastro, nota nula sem
   atendimento humano, filtro de nomes e bairros.
4. Grava resultado, modelo, versão, tokens e custo estimado; sugere follow-up só
   se não houver tarefa equivalente aberta.
5. Tetos: análises por dia, custo por mês; retentativa com espera crescente;
   recusa do modelo descarta só aquela conversa; chave inválida para a fila.
6. Telas mostram tudo como **inferência**, com confiança e evidências; revisão
   humana substitui a classificação nos indicadores e fica registrada.

Custo medido na amostra: ~US$ 0,013 por conversa no Haiku 4.5.

## 7. Configurações (tela do gestor)

Módulo ativo e funções avaliadas; pesos (IPC, esforço, resultado, qualidade e
por função); faixas de normalização; SLA e expediente; volumes mínimos,
cobertura mínima e rampa; follow-ups (tolerância, carência, robô); qualidade das
vendas (maturidade, coorte, alvos); alertas (notificação, teto, limiares); IA
(ligada, modelo, limites, teto de custo, retenção, rubrica); coleta e acesso ao
conteúdo das conversas. Tudo saneado no servidor e auditado (antes/depois).

## 8. Variáveis de ambiente

Nenhuma nova obrigatória. Usa `CRON_SECRET` (já existe) e as credenciais já
guardadas em Integrações (SZ e Anthropic). Opcionais: `PERF_TEMPOS=1` (tempos
da apuração no log) e `PAUSA_MS` (ritmo do script de carga histórica).

## 9. Testes e verificação

- `npm test`: **244 testes passando** (19 arquivos), dos quais **147** do módulo
  (15 arquivos): configuração, expediente, máscara e ocultação, cálculo das
  conversas (automação × humano, transferências, duplicadas e fora de ordem),
  vínculo com lead, scores (normalização, redistribuição, IPC, sem dados),
  follow-ups, atribuição (troca de vendedor), período, apuração, metas/projeção,
  permissões por papel e unidade, falhas e retomada da coleta do SZ, falhas do
  provedor de IA e IA (schema, saneamento, prompt injection, privacidade).
- Sem teste automatizado (conferidos à mão): fila da IA de ponta a ponta contra o
  banco, recálculo histórico em lote e responsividade (telas abertas em 390 px).
- `npm run build` sem erro; ESLint sem avisos no módulo.
- Todas as telas abertas no navegador com usuário gestor temporário, em 1440 px
  e 390 px: HTTP 200, sem erro de console, sem rolagem lateral.
- Exportações XLSX/CSV baixadas e conferidas; relatório inexistente devolve 400.
- Rotina rodada localmente sem SZ e sem notificar ninguém (36 s): recálculo,
  follow-ups, alertas e fotografias do dia.
- Carga histórica do chat desde 01/08/2026 (parada e retomada a cada
  instabilidade do SZ, sem insistir com a conta do robô).

## 10. Limitações

- **Ligações, UTM/campanha, custo de mídia (CAC), SVA e upsell:** sem fonte de
  dados — aparecem como "Não disponível".
- **Taxa de execução de follow-ups** só existe a partir do registro novo; o
  histórico anterior era um campo solto.
- **Probabilidade de fechamento** é qualitativa (baixa/média/alta) até haver
  histórico para calibrar.
- **Atendentes do chat sem vendedor vinculado** não somam esforço a ninguém
  (lista na tela de Configurações; vincular em Administração).
- Agosto/2026 tem dias com coleta parcial do SZ (instabilidade); a tela avisa
  quando a comparação entre períodos é afetada.

## 11. Riscos

- Uso dos indicadores para punição: mitigado por avisos em tela e exportação,
  revisão humana da IA e regras de comparabilidade — depende da gestão.
- Custo da IA: teto mensal e diário configuráveis; desligada por padrão.
- Notificações em excesso: só críticos novos, teto diário de 20.
- Instabilidade do SZ: coleta retomável; a conta robô é a mesma do robô de
  produção, então a rotina usa ritmo moderado.

## 12. Como validar

1. Abrir Performance Comercial como gestor e conferir a Visão geral contra o
   Dashboard (vendas e meta do mês devem bater).
2. Abrir o perfil de um vendedor e o detalhamento da nota (cada indicador mostra
   fórmula, numerador e denominador).
3. Em Relatórios e metas, conferir a meta do mês e a projeção de uma vendedora
   com a planilha de metas.
4. Em Configurações, conferir o status da coleta e da IA e mapear os atendentes
   sem vínculo.
5. Rodar uma amostra da IA (5 conversas) e revisar uma análise.
6. Depois da publicação: acompanhar em Configurações → Rotinas automáticas as
   execuções `performance_*`.
