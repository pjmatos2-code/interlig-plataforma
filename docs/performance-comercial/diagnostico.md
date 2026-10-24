# Performance Comercial — diagnóstico técnico (24/10/2026)

Auditoria feita antes de escrever código, como pede a seção 2 da especificação
"Interlig Performance Intelligence". Tudo abaixo foi conferido no código e nas
integrações reais (SZ Chat em modo só leitura), sem presumir endpoint ou campo.

## O que já existia e foi reaproveitado

- **Base:** Next.js 14 (App Router) + Supabase (Postgres 17, RLS), na Vercel.
  Rotina `/api/sync` a cada 5 min (SGP, CRM, robôs do SZ).
- **Perfis → papéis do módulo:** gestor = administrador; direção = diretoria
  (só leitura); supervisor de time = supervisor; coordenador de unidade =
  gerente de unidade (escopo da POP); vendedora (interna/externa) = vendedor.
- **CRM:** `tickets` com histórico imutável (`ticket_eventos`: reatribuição,
  nota, mudança de etapa, fechamento, reabertura), propostas estruturadas
  (`ticket_propostas`), visitas da venda externa, motivos de perda, metas
  mensais (`metas`) e calendário de dias úteis (`calendario`).
- **SGP:** contratos, 1ª fatura (`titulos`), OS de instalação.
- **Regras do PRD já testadas** (`lib/indicadores/regras`): venda contável,
  conversão real, churn 90 dias, inadimplência da 1ª fatura — usadas como
  estão, sem reescrever.
- **IA:** chave e modelo da Anthropic já configurados em Integrações (usados no
  follow-up e na retenção).

## O que o SZ Chat entrega de verdade (testado)

- **Disponível:** protocolo, agente, equipe, canal, classificação final;
  eventos do ciclo (fluxo automático, fila, início/fim do atendimento humano,
  transferências, encerramento por tempo); cada mensagem com horário e origem
  (cliente, automação, agente humano, sistema).
- **Não existe:** etiquetas (vêm vazias), motivo de encerramento, ligações,
  campanha/UTM, custo de mídia.
- **Antes deste módulo nada era guardado:** o robô lia a conversa, resumia e
  descartava as mensagens.

## Lacunas e como foram tratadas

| Lacuna | Tratamento |
|---|---|
| Sem registro de mensagens e tempos | Coletor próprio (`conversas_atendimento`, `conversas_mensagens`) com texto mascarado e retenção; carga histórica desde 01/08/2026 |
| "1ª tratativa" do CRM pouco confiável (preenchida pelo robô) | SLA de 1ª resposta vem do SZ (fila → 1ª mensagem humana, só no expediente) |
| Follow-up era um campo solto, sem histórico | Tabela `followups` + `followups_historico`, importando do CRM, do Meu Dia e do robô; a taxa de execução vale dali para frente |
| Origem de marketing sem UTM nem custo | Canal/origem limitados ao que existe; CAC aparece "Não disponível" |
| Ligações sem integração | Indicador "Não disponível" (sem telefonia) |
| Venda externa não usa o SZ | Esforço vem de visitas, propostas e CRM; ranking só compara a mesma função |
| Afastamentos e admissão não existiam | Cadastro simples (`indisponibilidades_vendedor`, `vendedores.admitido_em`) |

## Restrições respeitadas

- Banco: só tabelas e colunas **novas** (nada existente alterado ou apagado).
- Leitura do SZ só com a conta robô e sem escrever nada lá.
- IA desligada por padrão; sem chave, as telas mostram "indisponível" e não
  inventam análise.
- Publicação em produção e análise automática por IA dependem de aprovação.

## Achados de produção fora do escopo (não alterados)

- `robo_comercial` falha em ~95% dos ciclos do `/api/sync` com "sem orçamento
  no ciclo" desde pelo menos 18/10/2026: as etapas anteriores consomem o tempo
  da função. Por isso a rotina deste módulo tem cron próprio.
- O SZ fica instável em alguns horários (respostas em HTML ou timeout); a
  coleta para e retoma do ponto, sem insistir com a conta do robô.
