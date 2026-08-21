# Decisões pós-PRD

Registro de decisões e requisitos definidos pelo Paulo depois do PRD v1.1.
Em caso de conflito com o PRD, o que estiver aqui vence (é mais recente).

## D1 — Ticket automático do SZ Chat: só para conversas direcionadas a uma EQUIPE comercial habilitada (20/08/2026)

**Contexto:** no SZ Chat (Fortics), as filas comerciais são as **"Equipes"** —
print do painel de Monitoramento mostra: Comercial Altamira, Comercial
Belterra, Comercial Brasil Novo, Comercial Campo Verde, Comercial Divinópolis,
Comercial Placas (uma equipe por praça). Nem toda conversa vai para uma equipe
comercial — suporte, financeiro etc. também existem.

**Decisão do Paulo:** o gatilho da criação automática é a **equipe de destino
da conversa no SZ Chat**. O ticket só nasce se o cliente for direcionado a uma
equipe comercial **habilitada pelo gestor** (ex.: "Comercial Altamira",
"Comercial Brasil Novo"). Conversas de equipes não habilitadas são ignoradas
pelo webhook — registradas em log para auditoria, sem criar ticket.

**Configuração no admin (PRD 3.10), Fase 3:**
- Tabela `sz_equipes_habilitadas` (`sz_equipe_id/nome UNIQUE, pop_id?, ativo`):
  o gestor liga/desliga cada equipe e mapeia equipe → POP/praça da plataforma.
- A vendedora do ticket vem do `sz_atendentes_map` (atendente que assumiu);
  sem atendente mapeada, o ticket nasce "não atribuído" na POP da equipe para
  o supervisor distribuir (PRD 3.9).

**Impacto no cadastro de POPs:** a operação real tem mais praças que o seed
(Altamira, Belterra, Brasil Novo, Campo Verde, Divinópolis, Placas…). O
cadastro de POPs/cidades precisa cobrir essas praças quando os dados reais
entrarem — confirmar a lista oficial com o Paulo na Fase 0/3.

**Atualização 20/08/2026:** o Paulo tem acesso de administrador no SZ Chat e o
menu **Integrações** expõe: API, Central telefônica, RD Station e REST. Ou
seja, não depende de terceiros para configurar a integração. Na Fase 3,
investigar nesta ordem: (1) Integrações → REST como webhook de saída apontando
para `/api/webhooks/szchat` com o header `x-szchat-secret`; (2) passo de
requisição externa dentro do construtor de Fluxo, disparado na transferência
para a equipe comercial; (3) fallback: polling via Integrações → API.
Pendente: prints de dentro das telas REST e API para fechar o payload real.

**Atualização 20/08/2026 (documentação Fortics confirmada):** o mecanismo da
integração será o **componente REST dentro do construtor de Fluxo** do SZ.chat
— ele executa requisições HTTP/S para endereços externos no meio do fluxo de
atendimento, com método POST, headers customizados e corpo JSON usando
variáveis do fluxo (`@{{PARAM}}`); resposta disponível em
`@{{REST_HTTP_STATUS}}` / `@{{REST_HTTP_RESPONSE}}` (timeout 20s).
Plano da Fase 3: inserir o passo REST no ponto de transferência para a equipe
comercial de cada fluxo habilitado, chamando `POST /api/webhooks/szchat` com o
header `x-szchat-secret` e o payload de docs/szchat-samples/transferencia.json
(adaptado às variáveis reais do fluxo). Não há webhook nativo de eventos — e
não precisa. A API (Integrações → API, token `api_key`) fica para o fallback
de polling e a importação de transcrições (Fase 4).
Fontes: fortics.sz.chat/docs/pt-br/modules/rest e docs.fortics.com.br/chat.

**Status da integração SZ Chat (madrugada de 20/08/2026):**
- Aplicativo REST **"Interlig CRM - Ticket Altamira"** criado e salvo no SZ.chat
  (Integrações → REST → Aplicativos customizados), apontando para
  `POST https://interlig-plataforma.vercel.app/api/webhooks/szchat` com o header
  `x-szchat-secret` e corpo JSON com `@{{PROTOCOLO}}`/`@{{NOME_CONTATO}}`/
  `@{{TELEFONE_CONTATO}}` (nomes de variáveis a confirmar na instância).
- As 9 equipes comerciais estão habilitadas em `sz_equipes_habilitadas`
  (Altamira, Belterra, Brasil Novo, Campo Verde, Divinópolis, Placas + as 3 do seed).
- **PENDENTE:** inserir o componente RPA no fluxo correto — há muitos fluxos
  ativos e o Paulo vai confirmar com a equipe de sistemas da empresa qual é o
  fluxo do comercial de Altamira. Depois: publicar e testar com mensagem real
  (o ticket deve nascer no /crm em segundos).
- **Descoberta importante:** o SZ.chat da Interlig já tem aplicativos REST
  integrados ao SGP ("SGP | Consultar Cliente", "Consultar Fatura", "Pré-cadastro"
  etc.) — dentro deles devem estar a URL e o token do SGP, o que pode
  antecipar a Fase 0 (basta abrir um deles em Ações → Editar e copiar).

## D2 — Agente de follow-up com IA sobre as conversas do SZ Chat (21/08/2026)

**Pedido do Paulo (novo — não consta no PRD v1.1):** um agente que analisa as
conversas do SZ Chat dos tickets em aberto e, no dia seguinte, entrega à
vendedora o direcionamento da tratativa ideal para cada cliente (próxima ação
sugerida, tom, objeção a tratar).

**Status:** NÃO implementado. Pré-requisitos e desenho proposto:
1. **Transcrições**: token da API do SZ Chat (Integrações → API — o Paulo tem
   acesso admin) e o endpoint de histórico de conversas; importar a transcrição
   para o ticket (já previsto como Fase 4 no PRD 3.9/backlog #7).
2. **Agente**: rotina noturna (cron) que, para cada ticket aberto com conversa,
   envia transcrição + contexto do ticket (etapa, idade, plano de interesse,
   histórico) para a API da Anthropic (Claude) e grava a sugestão como evento
   do tipo nota estruturada no ticket ("Sugestão de tratativa — IA").
3. **Entrega à vendedora**: bloco "Direcionamentos de hoje" na home do CRM,
   junto dos lembretes de follow-up; supervisor vê os do time.
4. **Custo**: consumo da API da Anthropic por conversa analisada (estimar com
   volume real de tickets/dia antes de ligar para todo mundo).

**Ordem sugerida:** depende só do token da API do SZ (independe do fluxo/RPA
da D1) — pode ser o próximo módulo após as integrações de dados.

## D3 — Mapeamento real da API do SGP e limitações da URA (21/08/2026)

**Instância:** `https://atm-erp.interlig.net` (a URL cadastrada no módulo de
Integrações não deve incluir `/admin/` — a API mora na raiz).
**Autenticação:** `{token, app}` no corpo (POST). Paginação máxima: **limit=100**.

**Rotas confirmadas:**
- `POST /api/ura/clientes/` — paginada (`offset`/`limit`); cada cliente vem com
  `contratos[]` e `titulos[]` EMBUTIDOS → é a fonte principal do sync (uma
  varredura traz tudo).
- `POST /api/ura/consultacliente/` — detalhe por `{cpfcnpj}` ou `{contrato}`;
  traz `popNome`, `dataAlteracao`, plano, status display.
- `POST /api/ura/titulos/` — paginada, instância inteira (296 mil títulos),
  ordenada por id desc; útil para incrementais de pagamento.
- Não existem: `/api/ura/contratos/`, `/api/ura/planos/` (404).

**Escopo da carga (decisão do Paulo):** somente os POPs **Altamira,
Vitória do Xingu e Brasil Novo** (filtro por `endereco.cidade`, sem acento).

**Limitações da API URA e aproximações adotadas:**
1. **Vendedor não é exposto** → contratos reais ficam "não atribuídos". A
   atribuição real virá do CRM (reconciliação ticket→contrato) e/ou de outra
   rota/relatório a descobrir com o suporte SGP.
2. **Datas de assinatura/ativação não são expostas** → assumimos
   `dataCadastro` para as três (venda=assinatura=ativação). Efeito: esteira de
   ativação fica vazia para dados reais e o tempo venda→ativação zera, até
   descobrirmos rota com essas datas.
3. **Data de cancelamento não vem no embed** → para cancelados recentes
   (~14 meses) buscamos `dataAlteracao` via consultacliente (aproximação:
   última alteração ≈ cancelamento); antigos ficam com data_venda (fora das
   janelas de análise).
4. **Origem de cadastro não é exposta** → origem oficial passará a nascer do
   CRM (reconciliação define a origem no contrato — já implementado).
5. **Mensalidade não vem no contrato** → usamos o valor do título mais
   recente não cancelado do contrato.

**Carga inicial executada em 21/08/2026:** 14.925 clientes, 16.476 contratos
(9.391 ativos, 6.175 cancelados, 910 suspensos), 285.404 títulos e 167 planos
reais dos 3 POPs. A URA não devolve contratos cancelados no consultacliente;
as datas/motivos reais de cancelamento (abr–ago/2026, 1.184 contratos) vieram
do relatório "Contratos Cancelados" do SGP via scripts/importar-cancelados.py
+ aplicar-cancelados.mjs — repetir a importação periodicamente (ou descobrir
rota/admin API) para manter o churn fiel.

**Limpeza pós-carga (21/08/2026):** removidos todos os dados fictícios
restantes (8 vendedoras, POPs Santarém/Itaituba/Oriximiná, metas do seed,
mapeamentos SZ de demonstração). Regra de comissão substituída pela REAL da
planilha interna "COMISSÃO VENDEDORES internos": 7% da receita até 100% da
meta, 8% de 101–120%, 10% acima de 121% (validar com o Paulo; sem gatilhos por
ora). Centroides de 299 bairros calculados a partir das coordenadas reais de
9.148 clientes — mapa funcional. Usuários de teste supervisores movidos para o
POP Altamira.

**Pendências que dependem do Paulo (dados reais):**
1. Quadro REAL de vendedoras ativas (nomes) — não existe rota na API URA; a
   única confirmada em relatório é "Damely" (Altamira). Cadastrar via Admin.
2. Fonte da atribuição venda→vendedora: relatório do SGP com coluna
   "Vendedor" (exportar e importaremos) ou daqui em diante via CRM.
3. Metas reais por vendedora/POP (tela /metas) — sem metas, % e pace ficam
   "sem meta cadastrada" de propósito.

## D4 — Comissionamento Multissetorial (documento oficial, 21/08/2026)

Fonte: "Diretrizes de Configuração - Comissionamento Multisetorial.docx"
(pasta Anotaçoes/Comissoes Mensais do Paulo). Modelo escalonado com GATILHO DE
ATIVAÇÃO (abaixo do piso, comissão zero — o motor cobre isso não tendo degrau
abaixo do piso).

**Aplicado na plataforma (regras por vendedora, vigência 08/2026):**
- **Time Interno (SZ Chat/CRM)** — Damely e Karoline · meta 70/mês ·
  80–100%: 7% · 101–120%: 8% · 121–142%: 10% · ≥143%: 15% (VTV) · <80%: zero.
- **Time Externo (PAP)** — Andrea, Janaína, Tamiris e Ivanilda VTX (Vitória
  do Xingu) · meta 25/mês · faixas por quantidade convertidas em %:
  16–19 vendas (64%): 10% · 20–23 (80%): 15% · 24–39 (96%): 20% · ≥40 (160%): 25%.
- Estorno por early churn 90 dias já coberto pelo motor.
- Metas por POP derivadas da soma das vendedoras da praça.

**Setores do documento AINDA NÃO modelados (evolução futura):**
3. Refidelização (Talia e Klebiana — % sobre ticket de planos renovados);
4. Retenção (Breno — piso R$ 10/salvo + duplo gatilho taxa×volume, clawback 30d);
5. Coordenações (Carlos: 10% do VTV do trio de Altamira; Aline: 3% do VTV da
   praça Brasil Novo);
6. Override gerencial (3 gatilhos simultâneos, downgrade e risco de zerar).
Esses exigem novas fontes de dados (renovações, atendimentos de retenção) e
tipos de regra próprios.

**Pendência-chave que segue aberta:** atribuição venda→vendedora (a comissão
real só ganha valor quando as vendas forem atribuídas — via CRM ou relatório
do SGP com coluna Vendedor).
