# PRD — Plataforma de Inteligência Comercial Interlig

**Versão:** 1.1 | **Data:** 20/08/2026 | **Owner:** Paulo (Gerência Comercial)
**Changelog v1.1:** adicionado módulo CRM Comercial integrado ao SZ Chat (seção 3.10), substituindo o RD Station; novos KPIs 5.14–5.17; tabelas do CRM na seção 7; fases reorganizadas.
**Uso deste documento:** especificação de produto pronta para desenvolvimento via Claude Code + GitHub. Cada seção foi escrita para ser referenciada diretamente em prompts de implementação.

---

## 1. Visão Geral

### 1.1 Objetivo
Plataforma web de inteligência comercial que centraliza vendas, metas, comissionamento, qualidade da venda **e a gestão das negociações (CRM próprio)** da Interlig, alimentada em tempo quase real pela API do SGP e pelo SZ Chat. Substitui planilhas, o RD Station e consultas manuais por um painel único, com visão por perfil (gestor, supervisor, vendedora).

### 1.2 Problema que resolve
- Resultado de vendas disperso no SGP, sem visão consolidada diária por vendedora/POP/origem.
- Projeção de meta e comissão calculadas manualmente.
- Gargalos invisíveis: vendas paradas sem assinatura, ativações pendentes, churn precoce por canal.
- **Taxa de conversão desconhecida:** as vendedoras não lançam todas as negociações no RD Station. Como o ticket do CRM interno nasce automaticamente do fluxo do SZ Chat (e não do lançamento manual), o denominador passa a ser confiável — 100% dos atendimentos comerciais viram ticket.
- **Custo do RD Station:** o CRM interno substitui a ferramenta após a implantação.

### 1.3 Princípios de produto
1. **Dado do SGP é a fonte da verdade** para vendas, contratos e ativações. Metas, regras de comissão e classificação de origem são parametrizadas na plataforma.
2. **Cada perfil vê o que precisa para agir** — a vendedora vê seu pace e simulação de comissão; o supervisor vê sua POP; o gestor vê tudo.
3. **Indicador sem regra de cálculo explícita não entra no dashboard** (todas as regras estão na seção 5).

---

## 2. Perfis de Acesso

| Recurso | Gestor | Supervisor | Vendedora |
|---|---|---|---|
| Dashboard geral (todas as POPs) | ✅ | ❌ | ❌ |
| Dashboard da sua POP/cidade | ✅ | ✅ | ❌ |
| Painel individual (minhas vendas, meta, pace) | ✅ (qualquer) | ✅ (do seu time) | ✅ (só o próprio) |
| Ranking de vendedoras | ✅ completo | ✅ do seu time | ✅ (posições, sem valores das colegas) |
| Simulador de comissão | ✅ | ✅ (do time) | ✅ (só o próprio) |
| Comissão consolidada (R$ do time) | ✅ | ✅ (do time) | ❌ |
| Receita total / financeiro | ✅ | ❌ | ❌ |
| Churn precoce e inadimplência por safra | ✅ | ✅ (da POP) | ❌ |
| CRM: tratar tickets | ✅ (qualquer) | ✅ (do time, pode reatribuir) | ✅ (só os próprios) |
| CRM: visão do pipeline e conversão | ✅ completa | ✅ do time | ✅ (só a própria) |
| CRM: cadastro de motivos de não conversão | ✅ | ❌ | ❌ |
| CRM: painel de reconciliação com SGP | ✅ | ✅ (da POP) | ❌ |
| Cadastro de metas e regras de comissão | ✅ | ❌ | ❌ |
| Gestão de usuários e vínculo vendedora ↔ SGP | ✅ | ❌ | ❌ |
| Exportação (fase 2) | ✅ | ✅ | ❌ |

**Regras:**
- Autenticação por e-mail/senha com convite do gestor. Sem autocadastro.
- Autorização por linha no banco (RLS): vendedora só consulta registros com `vendedor_id` próprio; supervisor filtra por `pop_id` do seu escopo.
- Toda vendedora do SGP precisa estar mapeada a um usuário da plataforma (tabela `vendedores`, seção 7). Vendas de vendedor não mapeado aparecem para o gestor como "não atribuídas" — nunca somem.

---

## 3. Módulos e Telas

### 3.1 Dashboard Geral (home do gestor)
Filtro global de período (hoje / semana / mês / personalizado) e de POP/cidade, aplicado a toda a tela.

**Linha de KPIs (cards):**
- Vendas do período (quantidade) + comparativo vs período anterior
- Receita contratada do período (R$)
- Ticket médio
- Meta do mês: % atingido + **pace** (vendas/dia necessárias até o fim do mês)
- Ativações pendentes (contagem, com alerta se > X dias)
- Contratos pendentes de assinatura (contagem, com alerta se > 48h)

**Gráficos:**
- Vendas diárias (barras, dia a dia do período, com linha da meta diária)
- Vendas por POP/cidade (barras horizontais)
- Mix de planos vendidos (barras: plano × quantidade × receita)
- Origem de cadastro (venda externa/PAP, tráfego pago, presencial, indicação — distribuição e evolução)
- Projeção de fechamento do mês (linha realizada + linha projetada até o dia 30/31)

### 3.2 Painel por Vendedora
- Tabela: vendedora | vendas | receita | ticket médio | % da meta | pace | tendência (▲▼ vs semana anterior)
- Drill-down por vendedora: vendas listadas (cliente, plano, valor, status, origem), funil individual e histórico de meta dos últimos 6 meses.

### 3.3 Ranking Gamificado
- Pódio (top 3) do dia, da semana e do mês.
- Sequência ("streak") de dias batendo a meta diária individual.
- Badges automáticos: primeira a bater a meta do mês, maior ticket médio, melhor conversão, recorde pessoal.
- Visão da vendedora: sua posição e distância para a posição acima (sem expor valores das colegas).
- **Modo TV (fase 2):** rota `/tv` fullscreen com auto-refresh de 60s para o telão da sala comercial.

### 3.4 Funil de Conversão e Motivos de Perda
- Funil por vendedora e por canal: leads/atendimentos → propostas → vendas → instaladas.
- Vendas perdidas categorizadas: preço, concorrente, inviabilidade técnica, desistência, crédito reprovado, outro.
- Taxa de conversão por etapa, comparada à média do time.
- *Nota de dados:* o topo do funil (atendimentos → propostas) vem do **CRM interno (seção 3.9)** — cada ticket é um atendimento comercial, e seu desfecho alimenta conversão e motivos de perda automaticamente. No MVP (antes do CRM entrar no ar), o funil inicia em "venda registrada → instalada".

### 3.5 Esteira de Ativação (gargalos)
- Kanban/lista: **vendida → contrato pendente assinatura → aguardando instalação → instalada/ativada**.
- Idade de cada item na etapa (48h+ em assinatura pendente = vermelho).
- Tempo médio venda→ativação por POP e por vendedora.
- Taxa de instalação efetiva: % de vendas que viram cliente ativo em até N dias (padrão 15).

### 3.6 Mapa de Calor por Bairro
- Mapa (Leaflet/MapLibre + OpenStreetMap) com densidade de vendas por bairro no período filtrado.
- Camadas: vendas novas, clientes ativos, cancelamentos (fase 2).
- Fonte da geolocalização: endereço/bairro do contrato no SGP; geocodificação em lote na sincronização (Nominatim com cache local — nunca geocodificar em tempo de renderização).
- Fallback do MVP: agregação por bairro (coroplético ou círculos proporcionais por centroide do bairro) — mais robusto que ponto por cliente e evita problema de precisão de geocoding.

### 3.7 Metas, Projeção e Comissionamento
- Cadastro de metas: mensal por vendedora, por POP e global; a meta diária/semanal é derivada (seção 5).
- Projeção de atingimento (regra 5.6) com faróis: verde ≥ 100%, amarelo 85–99%, vermelho < 85%.
- **Simulador de comissão** (visão vendedora): comissão acumulada no mês + "faltam N vendas para o próximo degrau, que vale + R$ X".
- Regras de comissão parametrizáveis pelo gestor (seção 6) — nunca fixas no código.

### 3.8 Qualidade da Venda
- **Churn precoce:** % de contratos cancelados em até 90 dias da ativação, por vendedora, por origem e por POP (safra = mês de ativação).
- **Inadimplência por safra/origem:** % de primeiros títulos não pagos até o vencimento + 10 dias, por canal de venda.
- Cruzamento "vendas × churn precoce" por vendedora: identifica volume com qualidade baixa.

### 3.9 CRM Comercial (tickets de negociação) — substitui o RD Station

**Conceito:** todo atendimento comercial vira um **ticket** na plataforma, criado automaticamente quando o fluxo inicial do SZ Chat transfere o cliente para a fila/departamento comercial. A vendedora conduz a tratativa e **é obrigada a fechar o ticket com desfecho** — é isso que torna a taxa de conversão real e auditável.

**Criação do ticket:**
- **Automática (padrão):** webhook/evento do SZ Chat na transferência para a fila comercial → cria ticket com nome, telefone/WhatsApp, id da conversa no SZ e a atendente que assumiu. A atendente do SZ é mapeada à vendedora da plataforma (tabela `sz_atendentes_map`); sem mapeamento, o ticket cai em "não atribuídos" para o supervisor distribuir — nunca se perde.
- **Manual (complementar):** botão "novo ticket" para atendimentos que não passam pelo SZ (presencial na loja, telefone, PAP na rua). Formulário de 20 segundos: nome, telefone, origem.
- **Anti-duplicidade:** se já existe ticket aberto para o mesmo telefone/CPF, a nova conversa é anexada ao ticket existente. Se o cliente volta em até 30 dias após um ticket fechado "não convertido", o sistema oferece reabrir (preserva o histórico da negociação).

**Pipeline (kanban):** novo → em atendimento → proposta enviada → aguardando cliente → **fechado**. Cada ticket mostra idade na etapa e follow-up agendado (data de retorno com lembrete na home da vendedora).

**Fechamento obrigatório (regra central do módulo):**
- Não existe "fechar sem desfecho" e **ticket não pode ser excluído** por vendedora nem supervisor.
- **Convertido:** exige plano vendido + origem de entrada (venda externa/PAP, tráfego pago, presencial, indicação) + CPF ou telefone para reconciliação com o SGP.
- **Não convertido:** exige motivo da lista parametrizável (preço, concorrente, inviabilidade técnica, desistência, crédito reprovado, sem resposta, outro + observação).
- **Fechamento automático por inatividade:** ticket sem interação há N dias (padrão 15) é fechado como "não convertido — sem resposta", após aviso à vendedora no dia N−3. Evita ticket eterno "aguardando cliente" que maquia a conversão.

**Reconciliação com o SGP (o antifraude do indicador):** o sync cruza tickets e contratos por CPF/telefone e sinaliza no painel do gestor: (a) ticket convertido sem contrato no SGP em 7 dias — venda que não se concretizou ou erro de registro; (b) contrato novo no SGP sem ticket convertido correspondente — atendimento que não passou pelo CRM. Com isso, nem conversão inflada nem venda por fora escapam. Quando o match ocorre, o ticket recebe o `contrato_id` e a origem do ticket passa a valer como origem oficial do cadastro.

**Vínculo com a conversa:** o ticket guarda o `sz_conversa_id` e um link para a conversa no SZ Chat (transcrição importada via API na fase de integração, se disponível).

**Migração do RD Station:** convivência durante a implantação; importação opcional do histórico (CSV de negociações) para não perder base de comparação; desligamento do RD após 1 mês de operação estável do CRM.

### 3.10 Administração (gestor)
- Usuários e perfis; vínculo usuário ↔ vendedora do SGP; POPs/cidades e seus supervisores.
- Mapeamento atendente SZ Chat ↔ vendedora (`sz_atendentes_map`).
- Metas e regras de comissão com vigência (histórico preservado).
- De/para de origem de cadastro (valor do SGP → categoria da plataforma) e motivos de não conversão.
- Parâmetros do CRM: dias de inatividade para fechamento automático, janela de reabertura, janela de reconciliação.
- Status das sincronizações (SGP e SZ Chat): última execução, registros importados, erros.

---

## 4. O que fica fora do MVP (backlog priorizado)
1. Modo TV para telão (3.3)
2. Exportação PDF/Excel por visão
3. Alertas automáticos (WhatsApp/e-mail): venda parada 48h+, vendedora < 70% do pace no dia 15
4. Camadas extras do mapa (cancelamentos, penetração por bairro com homes passed)
5. CAC por canal, comparativo YoY
6. Metas por POP com projeção própria
7. Importação da transcrição da conversa do SZ Chat no ticket

---

## 5. Indicadores — Regras de Cálculo (fonte única da verdade)

Convenções: `período` = filtro ativo; `mês` = mês-calendário; **dias úteis** conforme calendário comercial cadastrado (padrão: seg–sáb, excluindo feriados cadastrados).

| # | Indicador | Regra |
|---|---|---|
| 5.1 | Vendas do período | Contagem de contratos com `data_venda` no período, excluindo cancelados antes da ativação quando o motivo for erro de cadastro/duplicidade |
| 5.2 | Receita contratada | Soma da mensalidade dos contratos vendidos no período (sem taxa de instalação; taxas em card separado se relevante) |
| 5.3 | Ticket médio | Receita contratada ÷ vendas do período |
| 5.4 | % da meta | Vendas do mês até hoje ÷ meta mensal |
| 5.5 | **Pace** | (Meta mensal − vendas acumuladas) ÷ dias úteis restantes no mês (inclusive hoje). Exibir como "precisa de X/dia" |
| 5.6 | Projeção de fechamento | Ritmo ponderado: 70% × média diária dos últimos 7 dias úteis + 30% × média diária do mês; projeção = acumulado + ritmo × dias úteis restantes |
| 5.7 | Ativações pendentes | Contratos assinados sem ativação no SGP; idade = hoje − data de assinatura |
| 5.8 | Pendentes de assinatura | Contratos vendidos sem assinatura registrada; alerta ≥ 48h |
| 5.9 | Taxa de instalação efetiva | Vendas do período ativadas em ≤ 15 dias ÷ vendas do período (janela fechada: só vendas com 15+ dias de idade) |
| 5.10 | Churn precoce (90d) | Cancelados em ≤ 90 dias da ativação ÷ ativados na safra (só safras com 90+ dias fechados) |
| 5.11 | Inadimplência de 1ª fatura | Primeiros títulos não liquidados até vencimento + 10 dias ÷ primeiros títulos vencidos no período |
| 5.12 | Conversão do funil | Instaladas ÷ vendidas (MVP); com lead na fase 3: por etapa |
| 5.13 | Streak | Dias úteis consecutivos com vendas ≥ meta diária individual (meta mensal ÷ dias úteis do mês) |
| 5.14 | **Taxa de conversão real** | Tickets fechados como convertidos ÷ tickets fechados no período (por vendedora, origem, POP). Fechados por inatividade contam no denominador como não convertidos |
| 5.15 | Tempo de 1ª tratativa | Mediana de (primeira interação da vendedora − criação do ticket), em minutos |
| 5.16 | Tempo de ciclo de negociação | Mediana de (fechamento − criação do ticket), em dias, separado por desfecho |
| 5.17 | Taxa de reconciliação | Tickets convertidos com contrato SGP vinculado em ≤ 7 dias ÷ tickets convertidos. Meta: ≥ 95%; abaixo disso há venda registrada errado em uma das pontas |

**Regra de ouro:** venda "conta" na data da venda; receita recorrente "conta" na ativação. Os dois números convivem no dashboard com rótulos distintos ("receita contratada" vs "receita ativada").

---

## 6. Comissionamento (parametrizável)

Estrutura de regra cadastrada pelo gestor, com vigência por mês:

```
Regra de comissão {
  vigência: (mês/ano início, fim)
  escopo: global | POP | vendedora
  degraus: [
    { atingimento_min: 0%,   atingimento_max: 79%,  tipo: valor_por_venda | % da receita, valor: R$ }
    { atingimento_min: 80%,  atingimento_max: 99%,  ... }
    { atingimento_min: 100%, atingimento_max: null, ... , bonus_fixo: R$ }
  ]
  gatilhos_extras: [ { condição: ticket_médio ≥ R$X | plano premium, adicional: R$ } ]
  estorno: comissão da venda é estornada se cancelamento ≤ N dias (padrão 90) — casa com churn precoce
}
```

- O simulador da vendedora usa a regra vigente + pace para responder "quanto ganho se vender mais N".
- Fechamento de comissão do mês gera snapshot imutável (auditoria) — recálculo retroativo só com ação explícita do gestor.

---

## 7. Arquitetura e Modelo de Dados

### 7.1 Arquitetura de integração SGP (decisão central)

**Nunca consultar a API do SGP em tempo de renderização do dashboard.** Padrão: **worker de sincronização → banco próprio → dashboard lê do banco.**

```
SGP (API pública, auth token+app)          SZ Chat (Fortics)
   │  polling incremental                     │  webhook: transferência p/ fila comercial
   ▼                                          ▼
Worker de sync (cron: 5–10 min)         Endpoint /api/webhooks/szchat (cria/atualiza ticket)
   │  upsert + normalização + geocoding       │
   ▼                                          ▼
        Postgres (Supabase) ── RLS por perfil ── reconciliação ticket ↔ contrato
   ▲
   │  queries agregadas / views materializadas
Dashboard + CRM (Next.js)
```

**Integração SZ Chat:** o SZ.chat (Fortics) expõe API REST e API receptiva; o mecanismo exato do evento de transferência (webhook nativo vs consulta periódica) será confirmado na Fase 0 junto ao suporte/documentação da Fortics. O endpoint `/api/webhooks/szchat` valida um segredo compartilhado (`SZCHAT_WEBHOOK_SECRET`), é idempotente (mesmo evento duas vezes não duplica ticket) e registra o payload bruto em `ticket_eventos` para auditoria. Se webhook nativo não existir, fallback: polling da API do SZ a cada 1–2 min pela fila comercial. **O CRM funciona de forma independente da integração** — criação manual de tickets desde o primeiro dia, automação plugada depois (decisão do Paulo: módulo primeiro, integração SZ na sequência).

Motivos: a API do SGP não é feita para query analítica; o banco próprio dá histórico, velocidade, independência de instabilidade do SGP e permite os cruzamentos (safra, churn, comissão) que a API não entrega prontos.

**Autenticação SGP:** método Token + App (gerado em *Administração → Integrações → Tokens* no painel do SGP), enviados no corpo das requisições. Restringir o token: somente rotas de consulta necessárias, sem permissão de liquidação/cancelamento, host permitido = servidor do worker. Credenciais em variáveis de ambiente (`SGP_BASE_URL`, `SGP_TOKEN`, `SGP_APP`) — nunca no repositório.

**Entidades a sincronizar do SGP:** clientes, contratos (status, plano, valores, datas de venda/assinatura/ativação/cancelamento, vendedor, endereço/bairro, origem), planos, títulos financeiros (para 5.11 e receita), e ocorrências de cancelamento (motivo). O mapeamento endpoint-a-endpoint é a primeira tarefa técnica do projeto (seção 9, Fase 0) usando a documentação oficial (bookstack.sgp.net.br) + inspeção da instância da Interlig.

**Estratégia de sync:** carga inicial completa (histórico ≥ 12 meses para safras de churn) + incremental por data de alteração; toda execução registra log em `sync_runs`.

### 7.2 Tabelas principais

```
usuarios        (id, nome, email, perfil[gestor|supervisor|vendedora], pop_id?, vendedor_id?, ativo)
pops            (id, nome, cidade, supervisor_id)
vendedores      (id, nome, sgp_vendedor_id UNIQUE, pop_id, usuario_id?, ativo)
planos          (id, sgp_plano_id UNIQUE, nome, velocidade, valor_referencia)
clientes        (id, sgp_cliente_id UNIQUE, nome, bairro, cidade, lat?, lng?, origem_cadastro)
contratos       (id, sgp_contrato_id UNIQUE, cliente_id, vendedor_id, plano_id, pop_id,
                 valor_mensalidade, status, origem_cadastro,
                 data_venda, data_assinatura?, data_ativacao?, data_cancelamento?,
                 motivo_cancelamento?, sync_updated_at)
titulos         (id, sgp_titulo_id UNIQUE, contrato_id, numero_parcela, valor,
                 vencimento, data_pagamento?, status)
metas           (id, escopo[global|pop|vendedora], referencia_id?, mes_ano, quantidade_vendas, receita?)
regras_comissao (id, escopo, referencia_id?, vigencia_inicio, vigencia_fim?, degraus JSONB,
                 gatilhos JSONB, estorno_dias)
comissoes_fechadas (id, vendedor_id, mes_ano, snapshot JSONB, valor_total, fechado_em, fechado_por)
origem_map      (id, valor_sgp, categoria[venda_externa|trafego_pago|presencial|indicacao|outro])
calendario      (data, dia_util boolean, feriado?)
bairros_geo     (id, cidade, bairro, lat_centroide, lng_centroide)
sync_runs       (id, iniciado_em, finalizado_em, entidade, registros, status, erro?)

-- CRM Comercial
tickets         (id, origem_criacao[sz_auto|manual], sz_conversa_id?, cliente_nome, telefone,
                 cpf?, vendedor_id?, pop_id?, etapa[novo|em_atendimento|proposta|aguardando|fechado],
                 criado_em, primeira_tratativa_em?, followup_em?, fechado_em?,
                 desfecho[convertido|nao_convertido]?, fechado_por[vendedora|auto_inatividade]?,
                 motivo_id?, plano_id?, origem_cadastro?, contrato_id?, reconciliado_em?)
ticket_eventos  (id, ticket_id, tipo[criacao|mudanca_etapa|nota|reatribuicao|fechamento|
                 reabertura|webhook_sz|reconciliacao], dados JSONB, usuario_id?, criado_em)
motivos_nao_conversao (id, nome, ativo, ordem)
sz_atendentes_map     (id, sz_atendente_id UNIQUE, vendedor_id)
```

Views materializadas para agregações quentes: `mv_vendas_diarias` (dia × vendedora × pop × origem × plano), `mv_safras_churn`, `mv_funil` — atualizadas ao fim de cada sync.

---

## 8. Stack Recomendada

| Camada | Escolha | Justificativa |
|---|---|---|
| Frontend | **Next.js 14+ (App Router) + TypeScript + Tailwind + shadcn/ui** | Padrão que o Claude Code domina; produtividade alta |
| Gráficos | Recharts | Simples, cobre todos os gráficos da seção 3 |
| Mapa | Leaflet + OpenStreetMap (react-leaflet) | Gratuito, sem chave de API do Google |
| Banco + Auth | **Supabase** (Postgres + Auth + RLS) | RLS resolve a matriz de perfis da seção 2 no banco, não no código |
| Worker de sync | Rota agendada (Vercel Cron / Supabase Edge Function a cada 5–10 min) | Sem infra dedicada |
| Hospedagem | Vercel (app) + Supabase (dados) | Deploy por push no GitHub; custo ~zero no início |
| Repositório | GitHub, branch `main` protegida, deploy automático | Fluxo Claude Code → PR → deploy |

---

## 9. Fases de Entrega

**Fase 0 — Fundação e descoberta (1ª semana de trabalho)**
Repositório + Next.js + Supabase + auth com 3 perfis; script `scripts/sgp-discovery.ts` que autentica (token+app) na instância da Interlig, chama os endpoints de clientes/contratos/títulos e salva exemplos de resposta em `docs/sgp-samples/` (dados sensíveis mascarados). Em paralelo: levantar com a Fortics/documentação do SZ.chat o evento de transferência de fila (webhook ou polling) e salvar payload de exemplo em `docs/szchat-samples/`. *Isso trava o mapeamento de campos antes de qualquer tela.*

**Fase 1 — MVP (o dashboard que muda o dia a dia)**
Sync completo + incremental; Dashboard Geral (3.1); Painel por Vendedora (3.2); Metas + pace + projeção (3.7, sem simulador); Esteira de ativação (3.5); consulta por período; admin básico (usuários, metas, de/para de origem).

**Fase 2 — CRM Comercial (3.9)**
Kanban de tickets com criação manual, fechamento obrigatório com desfecho, motivos de não conversão, follow-up, fechamento automático por inatividade; reconciliação ticket ↔ contrato SGP; conversão real (5.14) alimentando o funil (3.4); importação opcional do histórico do RD Station. *Entra antes da gamificação porque destrava o indicador mais cego hoje: a taxa de conversão.*

**Fase 3 — Integração SZ Chat + motivação**
Webhook/polling do SZ Chat criando tickets automáticos + mapeamento de atendentes; início da convivência CRM × RD Station rumo ao desligamento do RD. Ranking gamificado + streaks (3.3); regras de comissão + simulador + fechamento com snapshot (6); Mapa de calor por bairro (3.6); modo TV.

**Fase 4 — Qualidade e estratégia**
Churn precoce e inadimplência por safra (3.8); alertas automáticos; exportações; transcrição de conversas do SZ no ticket; CAC por canal e comparativo YoY.

---

## 10. Preparação para Claude Code + GitHub (otimização de créditos)

1. **Coloque este PRD no repositório** como `docs/PRD.md` e crie um `CLAUDE.md` na raiz apontando para ele, com: stack fixada (seção 8), convenções (idioma PT-BR na UI, nomes de tabela da seção 7) e a regra "regras de cálculo de indicadores: seguir exatamente a seção 5 do PRD".
2. **Uma fase por sessão.** Prompts curtos que referenciam o documento: *"Implemente a Fase 0 conforme docs/PRD.md seções 7.1 e 9"* — evita re-explicar contexto e queima menos crédito que descrever tudo no chat.
3. **Fase 0 antes de qualquer tela.** Descobrir o formato real das respostas do SGP da Interlig primeiro evita retrabalho caro nas telas.
4. **Dados de exemplo (seed)** em `supabase/seed.sql` com ~500 vendas fictícias: permite desenvolver e validar todas as telas sem depender do SGP, e serve de massa de teste para as regras da seção 5.
5. **Peça testes das regras de cálculo** (5.5, 5.6, 5.10, 6) — são o coração do sistema; um teste automatizado por regra custa pouco e evita sessões de debugging caras.
6. Commits pequenos por módulo; use PRs para revisar o que o Claude Code gerou antes de ir para `main`.

---

## 11. Riscos e Pontos de Atenção

| Risco | Mitigação |
|---|---|
| API do SGP não expõe algum campo (ex.: etapa de lead, motivo de perda) | Fase 0 descobre isso cedo; campos ausentes entram como lançamento manual ou fase 3 |
| Vendedor do SGP sem mapeamento na plataforma | Vendas caem em "não atribuídas", visíveis ao gestor — nunca somem do total |
| Geocoding impreciso de bairros | MVP usa agregação por bairro (centroide), não ponto por cliente |
| Regra de comissão muda no meio do mês | Regras têm vigência; fechamento gera snapshot imutável |
| Token SGP com permissão ampla vazar | Token somente-leitura, rotas restritas, host restrito, credencial em variável de ambiente |
| Dashboard exibir dado defasado sem avisar | Selo "atualizado há X min" em todas as telas + status do sync no admin |
| SZ Chat sem webhook nativo de transferência de fila | Fase 0 confirma com a Fortics; fallback: polling da API a cada 1–2 min; pior caso: criação manual continua funcionando |
| Vendedora fecha como "não convertido" e a venda existe no SGP | Reconciliação (3.9) sinaliza contrato sem ticket convertido — auditável pelo gestor |
| Ticket "aguardando cliente" eterno para não registrar perda | Fechamento automático por inatividade em N dias como "não convertido — sem resposta" |
| Migração do RD Station perder histórico | Importação CSV opcional + convivência de 1 mês antes do desligamento |
