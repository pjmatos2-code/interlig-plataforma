# Performance Comercial — indicadores e fórmulas (regras pc-1.0)

As mesmas fórmulas aparecem em cada tela (detalhamento da nota). Código:
`lib/performance/regras/*` (puro, testado) e `lib/performance/dados/calcular.ts`.
Datas civis de Santarém (UTC−3). Tempos "no expediente" usam o expediente das
Configurações (padrão seg–sex 8–18h, sáb 8–12h) e os feriados do `calendario`.

## Princípios

- **Nunca zero por falta de dado.** Indicador sem dado aparece "Não disponível"
  com o motivo: sem dados, volume insuficiente, não se aplica, sem integração,
  aguardando maturação, sem meta.
- **Peso redistribuído** só entre os indicadores aplicáveis; a **cobertura** (fração
  do peso que tinha dado) aparece junto. Cobertura < 40% ou componente
  essencial ausente → score **provisório** (*).
- **Normalização linear 0–100:** abaixo do piso = 0, no alvo ou acima = 100
  ("menor é melhor" usa alvo/máximo invertidos). Faixas configuráveis.
- **Esforço vai para quem agiu; resultado vai para o vendedor do contrato.**
- **Automação não é esforço:** mensagens do robô, fluxo e sistema não contam.
- **Leads** = tickets do CRM, fora os criados a partir de venda lançada direto
  no SGP (`sgp_auto`).

## Esforço comercial (0–100)

| Item (peso padrão) | Fórmula | Nota |
|---|---|---|
| Leads atendidos (10) | leads recebidos no período com ação humana ÷ leads recebidos | linear 50%→95% |
| SLA da 1ª resposta (10) | conversas com 1ª resposta humana em até 15 min de expediente ÷ conversas com 1ª resposta | linear 50%→90% |
| Follow-ups no prazo (20) | concluídos no prazo ÷ com vencimento no período (cancelados porque o lead fechou antes ficam fora; vencidos contam contra; robô fora por padrão) | linear 30%→90% |
| Ausência de leads atrasados (15) | 100 sem nenhum lead aberto "sem retorno"; cai até 0 quando 20% dos abertos estão sem retorno (exige ≥ 3 abertos) | — |
| Conversas trabalhadas (10) | conversas receptivas em que o vendedor respondeu ÷ conversas receptivas em que participou | linear 60%→95% |
| Propostas (15) | propostas registradas no CRM ÷ leads trabalhados (preço citado no chat não conta) | linear 0→0,5; só pontua se a função registra propostas (≥ 10 em 30 dias) |
| Recuperação (10) | leads perdidos/encerrados que voltaram (reabertos ou mesmo telefone em até 60 dias) e viraram venda ÷ perdidos elegíveis | linear 0→10% |
| Disciplina do CRM (10) | checagens atendidas nos leads abertos: telefone válido, etapa coerente, próximo passo agendado em negociação | linear 50%→95% |

Contexto (não pontua): leads recebidos/trabalhados, tempo de 1ª resposta
(mediana no expediente, também média e percentis), tempo entre interações
(cliente → próxima mensagem humana, bruto e no expediente), mensagens enviadas
e recebidas (não premia volume), distribuição por hora. **Ligações:** não
disponível (sem telefonia).

"Lead sem retorno": lead aberto sem ação humana há mais de 24 h de expediente.

## Resultado (0–100)

| Item (peso) | Fórmula |
|---|---|
| Meta de vendas (60) | vendas do período ÷ meta proporcional (meta mensal × dias úteis disponíveis ÷ dias úteis do mês, descontando afastamentos); nota = % limitada a 100 |
| Conversão real (40) | tickets fechados como convertidos ÷ tickets fechados no período (PRD 5.14); exige ≥ 5 fechados |
| Receita nova (0) | soma das mensalidades vendidas; só pontua com meta de receita |

Vendas = contratos com data de venda no período (PRD 5.1, mesma regra do
dashboard). Coordenador: a meta no registro dele é a da coordenação, então não
entra como meta individual nem nas somas.

## Qualidade (0–100)

| Item (peso) | Fórmula |
|---|---|
| Qualidade das vendas (70, essencial) | média das notas dos sinais maduros abaixo |
| Qualidade do atendimento — IA (30) | média das notas da IA (rubrica configurável) nas conversas analisadas; exige ≥ 5 análises e a IA ligada; revisão humana substitui a nota da IA |

Sinais de qualidade da venda (coortes maduras relativas ao fim do período,
janela de 90 dias; cada um vale 100 até o alvo e 0 no máximo):

| Sinal | Fórmula | Alvo → máximo |
|---|---|---|
| Cancelamento antes da instalação | vendas com 30+ dias canceladas sem ativar ÷ vendas com 30+ dias | 5% → 25% |
| Cancelamento em 30 dias | ativados há 30+ dias que cancelaram em até 30 dias ÷ ativados há 30+ dias | 3% → 15% |
| Churn 90 dias | cancelados em até 90 dias da ativação ÷ ativados há 90+ dias (PRD 5.10) | 3% → 15% |
| Inadimplência da 1ª fatura | 1ªs faturas não pagas até vencimento + 10 dias ÷ 1ªs vencidas (PRD 5.11) | 5% → 25% |

Menos de 8 vendas maduras → "Aguardando maturação" (nunca zero). São sinais de
investigação, não culpa automática do vendedor.

## IPC — Índice de Performance Comercial

IPC = 35% Esforço + 40% Resultado + 25% Qualidade (pesos configuráveis, também
por função). Resultado e Qualidade são essenciais: sem eles o IPC é provisório.

## Ranking — quem é comparável

Mesma função, ativo, não coordenador, fora da rampa (30 dias após a admissão),
disponível em ≥ 50% dos dias úteis do período, com meta quando a função tem
metas, cobertura do esforço ≥ 40% e algum dado de esforço ou resultado. Os
demais aparecem com o motivo, sem posição. Aviso automático quando a criação
de leads pelo chat variou mais de 2,5× entre os períodos (falha de coleta, não
desempenho).

## Funil (coorte de entrada ou de fechamento)

Lead recebido → atribuído → 1º atendimento humano → qualificado (proposta,
criação do contrato, venda ou IA quente/morno) → proposta → criação do contrato
→ venda → instalação agendada (OS no SGP) → ativado. Conversão etapa a etapa,
tempos medianos entre etapas, perdas por motivo e por etapa, por origem.

## Follow-ups

Status: sugerido (IA), programado, pendente (vence hoje), vencido, concluído no
prazo, concluído com atraso, cancelado, rejeitado. Concluído = primeira ação
humana no lead depois do agendamento (com carência de 5 min) ou marcado como
feito. "No prazo" = até o fim do dia do prazo (ou horário exato, configurável).
Prioridade da fila: intenção da IA, urgência, tempo sem interação, vencimento,
etapa, valor, probabilidade qualitativa.

## Metas e projeção

- Meta mensal de vendas: tabela `metas` (Metas e comissão).
- Metas extras (`metas_performance`): ativações, conversão, leads trabalhados,
  follow-ups, tempo de resposta, receita nova, ticket médio, qualidade do
  atendimento, esforço, IPC — por vendedor, função, equipe, unidade ou todos;
  diárias, semanais (seg–dom) ou mensais.
- **Projeção (estimativa):** realizado + ritmo dos dias úteis já encerrados ×
  dias úteis disponíveis que faltam depois da data de referência. Menos de 3
  dias úteis encerrados → sem projeção. Taxas e notas não têm projeção.
- Total de equipe/unidade: só quem tem meta no mês (regra do dashboard).

## Alertas

| Categoria | Regra |
|---|---|
| Crítico | lead quente (IA ou urgência alta) sem ação humana depois do sinal por mais de 30 min de expediente; intenção de compra sem proposta nem contrato após 1 dia de expediente; follow-up de alta prioridade vencido |
| Atenção | follow-ups vencidos acumulados (≥ 5); leads sem retorno; conversão abaixo de 70% do alvo; queda de produtividade (7 dias úteis < 60% da média de 30); disciplina do CRM < 60% |
| Informativo | meta do mês alcançada; no ritmo da meta; melhoria de conversão (+10 p.p.); lead recuperado; evolução do IPC (+10); equipe no ritmo da meta |

Agrupados por chave (contador de ocorrências), resolvem sozinhos quando a
condição some, resolvido à mão não volta antes de 24 h. Só críticos novos
notificam (vendedor e coordenação), com teto diário (20).
