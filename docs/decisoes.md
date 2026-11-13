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
- **Time Externo (PAP)** — Andrea, Janaína, Tamiris, Ivanilda VTX, Jessica
  Valentim e Maclicya Martins · meta 25/mês · **só comissiona acima de 80% da
  meta (20 vendas)** · faixas por volume (corrigido em 23/08/2026, migração 0024):
  <20 (<80%): 0% · 20–25 (80–100%): 10% · 26–31 (104–124%): 15% ·
  32–39 (128–156%): 20% · ≥40 (≥160%): 30%.
  (Antes o piso estava em 16 vendas/64% e o corte 15%→20% em 24 vendas/96%.)
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

## D5 — Critério de validação da venda e liberação da comissão (21/08/2026)

**Definido com o Paulo, automatizado em tempo quase real (sync + rotinas):**

**A venda PONTUA (meta/ranking)** quando o cadastro entra no SGP atribuído à
vendedora. Atribuição automática: reconciliação do CRM carimba o
`vendedor_id` do ticket convertido no contrato (nunca sobrescreve atribuição
existente). Venda sem ticket = "não atribuída" no painel de reconciliação.

**A COMISSÃO só LIBERA quando (os 6 critérios):**
1. Ticket no CRM próprio fechado como **convertido** ("negociação vendida");
2. Ticket **reconciliado** com o número do contrato do SGP;
3. **Plano do ticket = plano do contrato** no SGP;
4. **Termo de Adesão assinado** (assinatura eletrônica — tag do SGP);
5. **Contrato de Fidelidade assinado** (tag do SGP);
6. Serviço com **status ativo** (suspenso/inativo seguram; cancelado ≤90d estorna).

**Implementação:** flags de assinatura na tabela contratos, alimentadas pelo
verificador de tags no sync (consultacliente por contrato recente, lotes de
200/execução); /api/sync roda a reconciliação no mesmo ciclo; o motor de
comissão separa "pontua a meta" (todas as vendas válidas) de "recebe comissão"
(só liberadas) e expõe vendasPendentes + totalSeLiberar; telas mostram a
coluna Pendentes e o aviso no simulador. A esteira volta a ser real: sem as
duas assinaturas, o contrato aparece como "pendente de assinatura".

**Refinamento D5 — estorno por QUANTIDADE (21/08/2026, definição do Paulo):**
a venda fica monitorada por 90 dias. Se o cliente não pagar os boletos e o
cadastro for para suspenso (ou cancelado), o estorno é da QUANTIDADE, nunca do
valor: no início do mês o sistema soma esses clientes como débito na meta da
vendedora (ex.: 10 suspensos → meta efetiva +10). Implementado no motor
(debitoMeta/metaEfetiva, testado), no cálculo mensal (suspensos/cancelados dos
90 dias anteriores ao mês com 1ª fatura vencida e não paga) e nas telas
(coluna "Débito 90d" no time; aviso "meta efetiva" no simulador). O sync
ficou incremental de verdade: janela de 8 páginas por execução + verificação
de 25 assinaturas + títulos recentes (o histórico veio na carga inicial).

## D6 — Atribuição venda→vendedor: investigação e caminhos (21/08/2026)

**Campo correto:** o dropdown **"Vendedor"** em Contratos → Dados de Acesso do
serviço (ex.: "Dâmely Sibely Pereira Costa - damely.costa"). NÃO usar o
"Usuário/responsável" da ocorrência de instalação: para venda EXTERNA, o
coordenador é quem lança (com a agente selecionada no campo Vendedor), então o
criador da ocorrência seria o coordenador — atribuição errada.

**Confirmado NÃO exposto pela API token+app** (investigação exaustiva):
- `/api/ura/clientes/` (embed contratos), `/api/ura/consultacliente/` (54
  campos), `/api/os/list/` e `/api/ura/ocorrencias/` (traz `oc_id`, `os_id`,
  protocolo — mas SEM o campo "usuario"/vendedor).
- Testados params: vendedor, vendedor_id, expand, incluir_vendedor, completo,
  detalhado, extra_fields, usuario, oc_id — todos ignorados.
- OPTIONS autenticado: schema fixo, sem vendedor. Índice DRF `/api/` → 404.
- Docs TSMX (tsmx.net.br/developers) e bookstack: sem endpoint de vendedor.
- **Conclusão:** o campo Vendedor vive atrás do LOGIN DO PAINEL (sessão/cookie),
  não da API de integração.

**Caminho escolhido (pendente de credencial):** bot de leitura com um usuário
somente-leitura do painel. Paulo não pode criar usuário, mas pode REATIVAR e
editar um usuário desativado — trará depois (não hoje). Ao ter o login: logar
no painel, descobrir o endpoint interno que a tela de serviço usa para carregar
o Vendedor e ligar ao sync (atribui contratos recentes a cada ciclo). Guardar
credencial cifrada; usuário de leitura garante zero risco de escrita.

**A investigar sem depender do usuário (tarefa em aberto):**
1. Endpoint de contratos da categoria "central" da doc SGP (usa CPF+senha da
   central do cliente) — verificar se expõe vendedor.
2. Relatórios do SGP: descobrir se algum relatório (ex.: comissão/vendas) tem
   endpoint de export via token+app com a coluna Vendedor.
3. Pedido formal à TSMX (desenvolvimento@sgp.net.br) para expor o campo
   Vendedor no retorno da API URA — solução nativa definitiva.

**Ponte imediata:** relatório xlsx do SGP com coluna Vendedor →
scripts/importar-vendedores.py + aplicar-vendedores.mjs (já prontos).

## D7 — Integração SZ Chat: estado da investigação (21/08/2026)

**Host:** interlig.sz.chat (SPA Apollo). API: `/api/v4`, `/service`, GraphQL em
`/graphql`. Auth: `Authorization: Bearer <token>`.

**Webhook (push, para criar tickets) — NÃO entrega.** Integração "Interlig CRM"
salva, evento marcado, Seleção marcada, POST, JSON, Host com ?secret=. Mesmo
com 329 conversas ativas e agentes atendendo, ZERO eventos chegaram à nossa URL
(só testes internos). Suspeita nº 1: falta **vincular um canal** à integração.
Nosso endpoint está 100% (aceita header/query secret, JSON/form, captura tudo
em szchat_eventos_brutos, mapeamento flexível; testado — cria ticket na hora).
Descoberta do painel: a conversa de teste caiu em "Equipe Atendimento Altamira"
(não Comercial); equipe comercial real aparece como "Equipe Comercial Altamira"
(ex.: Dâmely). Confirmar nome exato no payload real.

**API de leitura (pull, para o follow-up D2):** token do agente (Gerar token de
autenticação) chega ao GraphQL, mas **introspecção desativada** e as queries de
atendimento/conversa estão em chunks code-split (não no app.js principal — só
achei searchTeams/pagination_teams/listContacts). Reverse-engineering cego é
frágil e de baixo retorno.

**Decisão:** pedir a documentação oficial da API à Fortics (mensagem redigida
para o Paulo). Com ela: (a) ligar o follow-up (ler conversas por equipe/data +
mensagens), (b) confirmar o vínculo de canal do webhook. Plataforma pronta dos
dois lados; falta só a documentação/credencial correta.

---

## D8 — Liberação de comissão durante a implantação (revisão da D5)

**Contexto:** o card "Conferência com o SGP" (agosto/2026) mostrou que o SGP
libera 187 vendas e a nossa validação D5 liberava 0 — porque nenhuma das vendas
nativas do SGP tem ticket convertido no CRM. As vendedoras ainda não tiveram
acesso à plataforma; o processo de CRM não está validado ao pé da letra.

**Decisão (Paulo, 21/08/2026 — opção 2):** a venda **nativa do SGP** (cadastrada
direto, sem passar pelo funil) **não exige** ticket no CRM para liberar comissão.
Régua de liberação passa a ser: **duas assinaturas eletrônicas + serviço ativo**
(igual ao SGP). O ticket do CRM só é exigido quando a venda passou pelo funil
(WhatsApp/SZ) — se houver ticket, ele precisa estar convertido e consistente
(mesma vendedora/plano). Implementado em `lib/comissao/dados.ts` (`comissoesDoMes`
e `conferenciaSgp`). Resultado agosto: liberadas 0→204; divergências 187→25
(4 elegíveis segurados por assinatura/serviço + 21 que liberamos e o SGP ainda
marca pendente). Rever quando as vendedoras estiverem operando o CRM.

---

## D9 — Esteira: aguardando instalação vem das OS abertas do SGP

**Contexto:** a aproximação D3 marca todo contrato como ativo/ativado, então
"assinado sem ativação" zerava a coluna. O processo real (Paulo, 21/08): a
ocorrência **Operacional / Instalação de equipamento** é o start dos contratos
prontos para o operacional — só OS **com responsável atribuído** está apta para
instalação. Quem atribui no painel: José Galdino / Aline Santos (Railson Costa
em Vitória do Xingu).

**Descoberta de API:** `/api/os/list/` com `{contrato: id}` retorna as OS
**abertas** do contrato com `os_setor`, `os_motivo_descricao`,
`os_tecnico_responsavel` (técnico designado — no painel a coluna "Resp." mostra
o atribuidor, ex. jose.galdino), `os_data_agendamento` e `os_data_cadastro`.
Sem filtro a rota estoura timeout; OS "Em execução"/finalizada **some** da
listagem (marcamos `saiu_da_fila`). `/api/ura/ocorrencias/` com `{contrato}` é a
versão enxuta (sem responsável). Tela do painel:
`/admin/atendimento/cliente/{cliente_id}/ocorrencias/`.

**Implementação:** tabela `os_instalacao` (0011) + rotina no worker (20
contratos/execução: vendas ≤21d + OS abertas) + backfill
`scripts/backfill-os-instalacao.mjs`. Esteira: coluna "Aguardando instalação" =
OS abertas ∪ assinados-sem-ativação; card mostra agendamento (ou "Sem
agendamento"), técnico e badge "pronta p/ operacional" quando o responsável
está atribuído, com link para as ocorrências do painel.

---

## D10 — Importação histórica do RD Station (agosto/2026)

**Contexto:** as vendedoras não lançam no RD no tempo certo — a finalização no
nosso CRM passa a fazer parte da validação do processo. Para partir com a base
completa, importamos o export de negociações do RD (deal CSV, 01–21/08).

**Carga (22/08):** 154 negociações → 146 tickets (8 perdidas sem NENHUM contato
no RD violariam a identificação mínima 5.17 — não importadas; todas da Damely).
130 vendidas (129 reconciliadas por ID Contrato→sgp_contrato_id; vendedor/plano/
POP vêm do CONTRATO SGP como fonte da verdade, com fallback no responsável RD e
no produto) + 16 perdidas com motivo mapeado ([INT] Parou de responder→Sem
resposta etc.). `tickets.rd_deal_id` (0012) garante idempotência. Mapeamentos:
Railson (RD)→Loja VTX; Fonte PAP→venda_externa, Loja Física→presencial,
WhatsApp (0800)→outro (não há categoria própria — avaliar criar), Instagram→
trafego_pago. Fonte/Produto/Qualificação★ originais ficam na trilha do ticket.

---

## D11 — Instrução Geral de Comissionamento AGO/2026 (documento normativo)

**Fonte:** PDF "INTERLIG_Instrucao_Geral_Comissionamento_Ago2026" (22/08). O
"Painel Comercial" (esta plataforma) é a fonte oficial de Vendas Novas.

**Aplicado agora (migração 0015):** faixa Desafio do time externo 25%→30%;
régua externa + meta 25 para Jessica Valentim e Maclicya Martins. Interno
(Dâmely/Karoline): meta 70, Desafio ≥143% (100+ vendas, 15% retroativo) —
já estava correto. Conquistas do ranking/totem reduzidas a 3 (pedido do Paulo):
Primeira a bater a meta · Meta desafio atingida (interna 100+/externa 40+,
vale várias no mês) · Vende todo dia (todos os dias úteis decorridos).

**Pendências da Instrução (exigem evolução do motor/módulos — combinar):**
(1) LIGCHIP compõe o VTV comissionável mas NÃO conta na contagem de vendas
para faixa — motor hoje conta tudo; (2) regra novata 10% flat 90 dias
(Maclicya, Amanda) — motor não tem "flat"; (3) coordenações: Marcelo Otávio
(faixas sobre VTV externa ALT, Ivanilda excluída) e Aline 3% da praça BN
(10% individual encerrado); (4) setores Refidelização (Talia/Myllena) e
Retenção POP-RET-001 v2.0 (Sandryne) — fonte RD, agentes/módulos não
existem na plataforma; (5) override de gerência (3 gatilhos + trava pelo
menor pilar, retenção neutralizada); (6) gatilho de ativação zera comissão
abaixo do piso (56 interno/16 externo) — conferir se o motor zera ou paga
degrau mínimo; (7) early churn vira débito na meta do mês seguinte (hoje o
débito entra no mês corrente).

---

## D12 — Mensalidade oficial: Vl. Base do Detalhe Comissão (bug do pró-rata)

**Bug (22/08):** a aproximação D3 gravava como `valor_mensalidade` o título
mais recente — e cliente novo tem a 1ª fatura PRÓ-RATA, então receita/ticket
de agosto apareciam pela metade (R$ 15,8k vs R$ 27,3k do painel).

**Correção em 3 camadas:** (1) `lib/sgp/api.ts`: mensalidade = MAIOR título
nominal do contrato; (2) migração 0016: gatilho `contratos_valor_oficial`
pina o Vl. Base do `comissao_sgp_itens` (e o vendedor do PDF, se faltar) em
todo insert/update — o sync não rebaixa mais; (3) contratos 22337/22360
(fora da janela incremental) inseridos via `/api/ura/consultacliente/`.

**Resultado:** 230/230 vendas, todas as vendedoras com contagem exata; receita
R$ 26.727,00 vs painel R$ 27.306,50 (resíduo de R$ 579,50 ≈ 2% = valores que o
SGP atualizou depois do export de 21/08 — zera reimportando um PDF novo do
Detalhe Comissão; o gatilho repropaga sozinho).

**D7 — avanço (22/08):** página Configurações → Canais mapeada. Canais comerciais:
0800 WhatsApp = canal 62702085acc2f200129c2d37 (provedor GUPSHUP, "Fluxo com IA");
INTERLIG Trafego Comercial = 6839c0f34cfb100018bace81 (conector Fortics, "Fluxo
Funil de Vendas"). O "Copiar webhook" da tela é o webhook de ENTRADA
(hub/v1/{provedor}/inbound/{canal}) — provedor→SZ, não serve para captura.
Caminho confirmado: componente Webhook/HTTP/REST dentro do editor de FLUXO,
apontando para /api/webhooks/szchat?secret=… no ponto em que a conversa vira
atendimento comercial. IDs salvos em integracoes_config.szchat.canais.

**D7 — RESOLVIDO (22/08):** integração SZ→plataforma publicada em produção.
Método: 3 nós "Requisição de URL" (type url) inseridos no "Fluxo com IA" do
0800, um antes de cada transferência para as equipes Comercial Altamira /
Comercial Vitória do Xingu / Comercial Brasil Novo (demais equipes/cidades
ficam de fora, decisão do gestor). POST para /api/webhooks/szchat?secret=…
com body: nome {{NAME}}, telefone {{PHONE}}, protocolo {{PROTOCOL}}, agente
{{AGENT}}, equipe (literal), canal, origem. Edição feita via navegador
(sessão do Paulo), nós manipulados via Vue (draggable lists), versão
publicada 6a89c72f (anterior 6a70f7f7 no Histórico p/ rollback). Aprendizados:
xlsx de export do painel sai zerado; export de fluxo é zip com senha; o
simulador "Testar fluxo" NÃO roda fluxos com Fortics IA (500 pré-existente,
provado por A/B). Pendente: validar payload real (1º WhatsApp) e calibrar
o mapeamento variáveis→ticket.

---

## D12b — Instalação = virada Inativo→Ativo no SGP (correção da aproximação D3)

**Descoberta do Paulo (23/08):** o que valida a INSTALAÇÃO no SGP é o status do
contrato mudar de Inativo para Ativo — a aproximação D3 (ativação = data do
cadastro) marcava tudo como instalado no dia da venda.

**Implementado:** (1) api SGP: contrato INATIVO chega sem data_ativacao;
(2) normalizarStatus: INATIVO → aguardando_ativacao (antes virava "ativo");
(3) worker: na virada para Ativo sem data anterior, carimba a DATA REAL da
instalação (dia em que o sync observou a virada) — datas de instalação passam
a ser reais daqui pra frente; (4) acerto de agosto via consultacliente
(contratoStatusDisplay): 201 ativos · 30 aguardando_ativacao (bate com o PDF)
· 1 cancelado · 1 suspenso. Efeitos: Esteira "aguardando instalação" agora
reflete os inativos reais; tempo venda→instalação passa a medir de verdade;
comissão continua exigindo serviço ATIVO (inativo não libera, correto).

**D12b — backfill (23/08):** o /api/os/list só devolve OS ABERTAS (concluídas
somem), então o histórico de instalação de agosto foi estimado pelo campo
dataAlteracao do consultacliente (em cadastro novo, a última alteração é a
ativação): 176 contratos com data posterior à venda + 25 no mesmo dia.
Resultado real na Esteira: tempo venda→instalação médio 1,8d (mediana 1d,
máx 15d) — Brasil Novo 0,8d · VTX 1,3d · Altamira 2,0d. Daqui pra frente a
data é exata (virada Inativo→Ativo observada pelo sync de 5 min).

---

## D2 — em produção (parcial, 23/08): follow-up com resumo no CRM

Tickets nascem em "Contato inicial" com **resumo da tratativa**, **próxima
abordagem** e **urgência** (alta/média/baixa com cores). Campos novos em
tickets (migração 0020). Seção "🔔 Follow-ups pendentes" no CRM (RLS recorta
por vendedora) + destaque colorido na ficha do ticket. Primeira carga: 8
conversas reais das equipes comerciais lidas via /reports/messages/getTalks
do SZ (payload: session_id + date; lista via /reports/messages/filter, cujo
filtro de equipe finalCampaign é IGNORADO pelo servidor — filtrar client-side
por campaign_id). Pendente para fechar D2: automatizar a leitura+resumo via
IA no ciclo do webhook/cron.

**D2 robô — VALIDADO (23/08):** login server-side com admin API Altamira
(apialtamira@interlig.com) → acesso a /reports liberado (1148 conversas/dia).
Pipeline provado ponta a ponta sem sessão humana: login → filter (9 conversas
comerciais de 22/08, idênticas à leitura manual) → getTalks (60 msgs da Tayna)
→ resumo+urgência. Heurístico funciona; qualidade real exige ANTHROPIC_API_KEY.
Rota de produção /api/sz/ler-conversas responde "Redirecting" no curl direto
(proteção Vercel) — validar no agendamento do cron com o secret certo.
Falta: (1) ANTHROPIC_API_KEY (.env.local + Vercel); (2) cron-job.org 22:30 UTC;
(3) trocar a senha do robô (foi digitada no chat).

## D13 — Perfis de acesso (23/08/2026)
Quatro tipos de usuário e o que cada um enxerga:

| Módulo | Administrador | Coordenador | Vendedora interna | Vendedora externa |
|---|---|---|---|---|
| Dashboard | ✅ tudo | ✅ seu POP | — | — |
| Vendedoras | ✅ | ✅ seu POP | — | — |
| Minhas vendas | ✅ | ✅ | ✅ só dela | ✅ só dela |
| Ranking | ✅ | ✅ | ✅ | ✅ |
| **Esteira** | ✅ tudo | ✅ seu POP | ✅ **só os contratos dela** | ✅ só os dela |
| CRM | ✅ | ✅ | ✅ só dela | ✅ só dela |
| Venda Externa | ✅ | ✅ | ❌ bloqueada | ✅ (rota inicial) |
| Metas e comissão | ✅ | ✅ | ✅ | ✅ |
| Qualidade / Mapa | ✅ | ✅ | — | — |
| Administração | ✅ | — | — | — |

- Enum `perfil_usuario`: gestor→Administrador, supervisor→Coordenador, vendedora→Vendedora interna, vendedora_externa→Vendedora externa (migrations 0022/0023).
- `ehVendedora()` unifica o escopo das duas vendedoras; RLS `no_escopo()` limita interna/externa a `vendedor_id = vendedor_atual()`.
- Esteira da vendedora: mostra o kanban (pendente assinatura / aguardando instalação / instaladas) e a lista de assinaturas pendentes — só dos contratos dela. Quadros gerenciais (tempo médio por POP/vendedora, assinaturas por vendedora) ficam ocultos.

### D13.1 — Coordenador × Venda Externa (23/08/2026)
O PAP atua nas 3 cidades comerciais (Altamira, VTX, Brasil Novo), independente do
POP. Como há um único coordenador (Marcelo Otávio), o módulo Venda Externa lê e
grava via client admin para gestor e coordenador (cruza POPs); a vendedora externa
segue restrita às suas próprias visitas pela RLS. Se no futuro houver mais de um
coordenador e for preciso segmentar por praça, marcar o coordenador do PAP e trocar
a leitura admin por uma política RLS específica de venda externa.

## D14 — Débito de meta por COORTE MENSAL (M-3) — 28/08/2026
**Substitui** a janela móvel de 90 dias (Instrução Geral AGO/2026, seção 6).
Formalizado no **Adendo 01/2026**.

- A competência M avalia **somente as vendas do mês M-3**: agosto→maio,
  setembro→junho, outubro→julho.
- **Lista fixa** (a coorte não muda), **status reavaliado** até o fechamento:
  cliente reativado ou que quitou a 1ª fatura **sai do débito** (opção B).
- **Critério final (28/08, após validação com dados reais)**: conta como
  pendente todo contrato da coorte que **não esteja ATIVO** no fechamento —
  pendente de instalação, inativo/aguardando ativação, suspenso ou cancelado.
  (Duas versões anteriores foram descartadas: "1ª fatura não paga" zerava
  vendedoras com muitos suspensos, e o INNER JOIN com títulos escondia os
  cancelados sem fatura — 12 dos 16 cancelados de maio ficavam invisíveis.)
- **Motivo**: na janela móvel, o mesmo contrato podia debitar a agente em até 3
  competências seguidas (dupla/tripla contagem). Na coorte, cada venda é
  julgada uma única vez.
- **Override**: linha em `debitos_meta_mensal` com origem 'manual' prevalece
  (ajuste validado pela gestão), auditável.
- Implementação: `lib/comissao/debito.ts` (usado por `comissoesDoMes` e
  `minhaComissao`). O congelador automático do dia 1º foi removido — a coorte
  é auto-travada por definição.

**Números finais de agosto/2026 (coorte de maio, critério "não ativo"):**
Karoline 30 (de 143 vendas) · Damely 15 (56) · Andrea 11 (30) · Janaína 6 (21) ·
Tamiris 5 (26) · Ivanilda VTX 3 (12) · Aline Santos 3 (20) · Loja VTX 0 (6).
Total: 73 pendentes de 314 vendas de maio (23%).

## Consulta de crédito por PDF — Consult Center (21/09/2026)

- **O que**: a vendedora anexa o relatório Serasa completo (PDF da Consult
  Center) no ticket; a plataforma extrai score/CPF/titular/protocolo/pendências
  localmente (pdfjs, sem serviço externo), enquadra na régua Interlig
  (`score_regua`) e mostra a condição de entrada. Substitui a digitação manual
  do score — score de consulta processada não tem edição manual
  (`tickets.score_origem = 'consulta'`); o caminho é "Anexar nova consulta"
  (versionada, nada é apagado).
- **Fase 1 = MONITORAMENTO (decisão deliberada da gestão)**: pagamento pendente
  NUNCA trava conversão, contrato, OS, agendamento, instalação ou ativação. O
  fechamento como Vendida com adiantamento pendente mostra confirmação simples
  ("Voltar e conferir pagamento" / "Continuar atendimento") e o prosseguimento
  é registrado em `credito_prosseguimentos` (métrica do piloto). Sem
  justificativa obrigatória nesta fase.
- **Feature flag**: `integracoes_config['politica_credito'].modo` =
  `monitoring` | `enforced`. O modo enforced existe só como arquitetura (o
  botão de prosseguir some) e NÃO deve ser ligado sem decisão explícita da
  gestão.
- **Regras de extração**: score SÓ do padrão "Score NNN de 1000" (nunca o
  percentual, a faixa 401-500 do texto Serasa ou a cor do gráfico); score
  ausente ≠ zero (vira "requer conferência", sem faixa); data de referência =
  bloco "Resultado da consulta"; totais de pendência saem do RESUMO (o
  detalhamento só alimenta a lista — a mesma dívida aparece 2x no relatório).
- **Titular**: CPF do PDF x CPF do ticket (string de 11 dígitos) + vínculo SGP
  por CPF. Divergência = alerta forte + auditoria, sem trocar o titular e sem
  atualizar o score do ticket (o score é de outro CPF). Nome extraído por
  coluna (o PDF traz nome e nome da mãe lado a lado); nome da mãe/idade/sexo/
  bairro não influenciam nada.
- **Credores**: `credores_conhecidos` (MOV = "Provedor de internet",
  classificação informada pela gestão). Só match EXATO de nome/alias mostra
  "Pendência registrada com provedor de internet" — e pendência NÃO muda a
  faixa nesta versão.
- **Privacidade**: PDF em bucket privado `consultas-credito` (URL assinada 1h,
  nome de arquivo sem CPF), CPF/nome mascarados na UI, orientação copiável ao
  cliente nunca menciona faixa/score/dívida (classificação interna).
- Migração: `0087_consulta_credito.sql`.

## Meta por unidade (23/09/2026)

- **Coordenador não soma**: a meta de coordenador (`vendedores.eh_coordenador`,
  0094) é a meta do TIME dele (Marcelo = externa; Aline Santos = BN) e fica
  fora de qualquer soma de meta.
- **Meta da unidade**: cadastrada em Metas com escopo POP quando é um número
  de gestão — **BN = 30 e VTX = 30** (25 da agente local + 5 de vendas
  ocasionais de agentes de outras cidades). **Altamira não tem meta de POP
  cadastrada**: deriva da soma das metas dos agentes ativos da unidade
  (internos + externos, sem coordenador) — hoje 215.
- **Meta geral** (card do dashboard, evolução diária, desafio do dia do
  totem): meta global cadastrada, ou a SOMA DAS METAS DAS UNIDADES
  (cadastrada ?? derivada) — hoje 215 + 30 + 30 = 275.
- Nos meses seguintes: cadastrar BN/VTX = 30 (ou o valor decidido) e deixar
  Altamira sem cadastro de POP para continuar derivando sozinha.

## Virada de mês no CRM (27/09/2026)

- **Modelo**: o funil de cada mês começa limpo. Negociação aberta não migra
  de mês: até o último dia, toda negociação precisa de desfecho (Vendida ou
  Não convertida com motivo obrigatório + observação opcional).
- **Automação**: nos 3 primeiros dias do mês, `fecharMesNaVirada()` fecha os
  abertos criados no mês anterior como não convertido, motivo padrão
  **"Mês encerrado sem conversão"** (fica no histórico do ticket). Válvulas:
  reabertura em até 30 dias se a negociação continuar; perdidos saem na
  exportação para o recontato.
- **Aviso**: banner âmbar no CRM nos últimos 3 dias do mês com a contagem de
  abertos e a data-limite.

## Retenção: irreversível fora do denominador (30/09/2026)

- Taxa de retenção = retidos ÷ (retidos + perdidos + em risco). Casos
  irreversíveis (mudança p/ fora de cobertura etc.) NÃO pesam na taxa —
  nem pendentes nem aprovados. A aprovação da evidência pelo gestor segue
  como auditoria. (Antes: irreversível pendente pesava no denominador.)

## Filtro de entrada 2ª fase: só PDF + sinalização (01/10/2026)

- **Score manual DESATIVADO**: a única porta é o PDF da Consult Center
  (extração local valida score, CPF × titular, pendências, valor e dívida
  com provedor de internet). Fechar como Vendida (residencial) exige
  consulta EXTRAÍDA (`score_origem = 'consulta'`); corporativo segue isento.
- **Sinalização (continua não bloqueante nos fluxos automáticos)**:
  selos nos cards do CRM — 🔴 SEM CONSULTA (nome em vermelho na vendida),
  🟠 DIVERGÊNCIA DE TITULAR, 🟡 ADIANTAMENTO PENDENTE; chip de filtro
  "Sem consulta"; contador "Vendidas sem consulta" no rodapé do CRM;
  coluna "Sem consulta" no Painel por vendedora (ranking da disciplina);
  esteira trata score manual antigo como sem consulta.

## Ticket nasce quando a agente assume a conversa (01/10/2026)

- O filtro de entrada (consulta + adiantamento) acontece DURANTE a
  negociação — o ticket precisa existir antes do encerramento.
- O relatório do SZ só lista encerradas e o Monitoramento usa websocket
  (Pusher), mas a tela carrega o estado inicial por
  `POST /monitoring/session/all` (attendance/navigating/wait).
  `lib/sz/monitor.ts` lê esse estado a cada ciclo do sync (5 min) e no
  botão "Atualizar do SZ": conversa EM ATENDIMENTO numa equipe comercial,
  com agente atribuída, ganha ticket em "Contato inicial" (ou é amarrada ao
  ticket aberto do mesmo telefone). Agente→vendedora via
  `/monitoring/online-agents` (nome) com aprendizado em sz_atendentes_map.
- Independe do nó de webhook do fluxo do 0800 (que segue funcionando).
- Visível em Administração como `sz_atendimentos`.

## Ticket vendido herda a vendedora do contrato (01/10/2026)

- `herdarVendedoraDoContrato()` (a cada ciclo): ticket com contrato e sem
  vendedora recebe a vendedora do contrato (leitor de painel). Migração
  0102: ticket fechado aceita PREENCHER vendedora vazia; trocar continua
  exigindo reabertura.
- `descartarTicketsSgpDuplicados()`: ticket automático da venda no SGP
  (`sgp_auto`, sem interação humana) é descartado quando existe ticket real
  no mesmo contrato (a venda contava em dobro). Migração 0101: função de
  sistema `descartar_ticket_automatico` — única exceção à trava de exclusão.

## Modo TV oficial = dashboard comercial (01/10/2026)

- `/tv/comercial`: dashboard da empresa inteira no modelo aprovado
  (vendas/receita/ticket/ativações hoje vs. dia útil anterior, instalações
  agendadas hoje no lugar de cancelamentos — cancelamento diário não é
  confiável hoje —, Meta Geral 2026, meta do dia, evolução por hora, funil,
  top 5 com fotos, 3 unidades). Escala sozinha para qualquer TV.
- Alerta de nova venda em tela cheia: padrão = símbolo oficial (4 pixels
  recortados do arquivo da marca) + som de moedas; `?alerta=sino`,
  `?som=conexao|sino` trocam; `?demo=1` mostra botão de simulação.
- Acesso: gestor, supervisor e direção (usuário de TV: perfil direção).
  `/tv` redireciona para `/tv/comercial`; `/tv/ranking` (totem vertical)
  segue separado. Botão "Ver no modo TV" no dashboard principal.
- Mês sem metas cadastradas: a TV usa as metas do último mês cadastrado.

## Performance Comercial — regras de apuração (24/10/2026)

- Módulo novo em `/performance` (docs em `docs/performance-comercial/`).
  Indicadores são apoio à gestão: não usar isoladamente para decisão
  trabalhista ou disciplinar.
- **Leads** excluem os tickets criados a partir de venda lançada direto no SGP
  (`sgp_auto`) — não houve trabalho comercial antes da venda.
- **Retornos automáticos do robô** entram na fila de follow-ups (são compromisso
  com o cliente), mas ficam fora da taxa de execução por padrão (configurável).
- **Coordenador:** a meta no registro de vendedor dele é a da coordenação; fica
  fora das metas individuais, das somas por unidade e do ranking. Total da
  equipe = quem tem meta no mês (mesma regra do dashboard, decisão de 20/10).
- **Comparabilidade do ranking:** mesma função, ativo, fora da rampa (30 dias),
  disponível ≥ 50% do período, com meta quando a função tem metas e cobertura
  do esforço ≥ 40%. Os demais aparecem com o motivo, sem posição.
- **Esforço** vai para quem agiu; **resultado** para o vendedor do contrato.
- **Projeção** de meta é sempre rotulada como estimativa.
- Rotina com cron próprio (`/api/performance/rotina`, 10 min), fora do
  `/api/sync`; nunca grava status "executando" em `sync_runs`.
- IA desligada por padrão; ligar é decisão do gestor nas Configurações.

## Performance Comercial só para o administrador, por enquanto (24/10/2026)

- Decisão do Paulo logo após a publicação: o módulo fica visível e acessível
  só para o perfil gestor (administrador) até ele liberar a equipe.
- Configurável em Performance → Configurações → "Quem abre o módulo"
  (diretoria, supervisores/coordenadores, vendedores), sem nova publicação.
- Enquanto um papel não abre o módulo, ele não vê o menu, as telas e a
  exportação recusam (escopo no servidor) e os avisos de alerta crítico não
  são enviados para ele.

## Retenção: vínculo do caso ao contrato e casos repetidos (27/10 e 03/11/2026)

- **Vínculo (27/10):** em outubro nenhum caso criado pelo robô ganhou contrato
  e a auditoria, que só julga caso com contrato, deixou 36 em "novo". Causas:
  o CPF da conversa era comparado só em dígitos (o cadastro grava
  `000.000.000-00`); o telefone era procurado numa lista que o banco corta em
  1.000 clientes (de 15,5 mil); e o contrato cancelado depois da conversa
  ficava fora da escolha. Agora: CPF/CNPJ válido citado na conversa →
  telefone (últimos 8 dígitos; LID do WhatsApp não conta) → nome completo,
  quando um único cliente tem esse nome. Vale o contrato da época da conversa:
  de preferência o cancelado a partir dela (é o desfecho); senão o mais
  recente não cancelado (`lib/retencao/vinculo.ts`, `casar.ts`).
- **Auditoria:** "cancelado antes do caso" é medido pelo dia da CONVERSA
  (data do protocolo), com 1 dia de folga — não pelo dia em que o robô criou
  o caso, que pode ser dias depois.
- **Casos repetidos (03/11):** o mesmo cliente em até 15 dias é a MESMA
  solicitação — reconhecido pelo contrato, pelo telefone (com ou sem 55) ou
  pelo nome completo de 3+ palavras; contratos diferentes são casos
  diferentes. Se a agente já abriu o caso à mão, a conversa do SZ completa
  esse caso (protocolo, telefone, análise) em vez de abrir outro; o cadastro
  manual recusa o segundo caso e aponta o existente; o botão trava enquanto
  envia (clique duplo). Simulado nos 131 casos desde setembro: pegaria só os
  5 repetidos conhecidos.
- **Dados:** os 36 casos de outubro foram vinculados e carimbados pela régua
  em 27/10; os repetidos de outubro foram juntados em 03/11 e as cópias,
  marcadas "(cópia — excluir)", ficam para o gestor excluir no painel.

## Gerência: sem early churn — recebe pelo total vendido no mês (03/11/2026)

- **Decisão do Paulo:** a comissão da gerência não tem early churn; a gestão
  recebe pelo total vendido no mês. O débito de early churn continua só das
  vendedoras (`lib/comissao/debito.ts`). A especificação v1.1 do override
  previa o débito na gerência a partir de outubro — fica revogado.
- **Por quê:** em outubro/2026 o pilar Vendas mostrava 200 / 190 contra 264
  vendas no dashboard. A conta era 264 − 3 sem vendedora (Prefeitura, uma
  permuta e uma venda sem vendedora no SGP) = 261, menos 61 do débito das
  vendedoras (safra de julho: 34 suspensos e 27 cancelados). Sem o débito,
  outubro sobe de N3 (2,5%, R$ 2.707,61) para N4 (3%, R$ 3.249,13).
- **Dados:** migração 0127 — `gerencia_config.flag_early_churn` fica sem uso
  (comentário na coluna); outubro registrado com a observação da decisão, que
  vai para o snapshot do fechamento.

## Fidelidade da base: lista de clientes por plano (04/11/2026)

- **Pedido do Paulo:** clicar no número de um plano do gráfico (ex.: "200 MB
  corporativo") e saber exatamente quem são os clientes, para entrar em
  contato — na plataforma ou em planilha.
- **Por que não o SGP:** o relatório Fidelidades do SGP não filtra pelo grupo
  de plano da plataforma (que junta vários planos do SGP, ex.: "FIBRA
  CORPORATE 200MB" e "200MB | PJ") nem tira permutas, isentos e órgãos
  públicos. O link do SGP mostraria outra lista e outro número.
- **Como ficou:** a leitura diária do relatório (madrugada ou "Atualizar
  agora") passa a guardar os contratos de cada unidade e faixa em
  `fidelidade_contratos` (migração 0129), com o grupo do plano calculado na
  mesma conta do gráfico (`montarLeituraFidelidade`). O número de cada plano
  abre `/fidelidade/lista` — nome, telefone, plano, mensalidade e fim da
  fidelidade, com WhatsApp e link para os contratos do cliente no SGP — e a
  planilha sai em `/api/fidelidade/exportar`. "Outros N planos" abre
  exatamente os planos que o gráfico juntou (`planosDoEscopo`).
- **Dado pessoal:** a tabela só é lida pela service role; tela e planilha
  checam o perfil (gestor, direção, agentes de atendimento e coordenação de
  unidade, presa à própria unidade). Nome, telefone e mensalidade vêm do
  cadastro na hora; o nome do relatório é o reserva.
- **Conferido em 04/11:** ensaio sem gravar contra o SGP — a lista das 12
  faixas bate com o gráfico (diferenças de 1 contrato onde a base mudou desde
  a madrugada); "200 MB corporativo" sem fidelidade = 29, todos em Altamira;
  97% dos contratos têm telefone no cadastro.

## Relatório da diretoria: Relatório Comercial Semanal (04/11/2026)

- **Pedido do Paulo:** a própria plataforma monta o relatório semanal que o
  CEO usa na reunião de segunda, no formato do modelo aprovado
  (`Relatório Comercial Semanal.html`, semana de 26/10 a 01/11): placar de 10
  indicadores com status, vendas, esteira, base, fila de débito, insights,
  quem cobrar e as perguntas da reunião, com o que se digita salvo. Depois
  vêm o envio por e-mail (com o resumo no corpo) e o automático de segunda.
- **Etapa 1 (esta):** tela `/relatorios` (gestor e direção) com "Gerar
  relatório" por semana e a lista dos gerados; o relatório abre em
  `/relatorios/semanal/<id>`, fora do menu, no visual do modelo. Tabela
  `relatorios_semanais` (migração 0130): números e textos congelados na
  geração; regerar a semana mantém o que foi digitado na reunião. O checklist
  de uma semana vira o "combinado" da seguinte.
- **Números (`lib/relatorio-semanal/dados.ts`):** service role, todas as
  páginas (várias telas cortam em 1.000 linhas), mesma régua das telas.
  - Venda = `ehVendaContavel` pela data da venda. Prefeitura e rede neutra
    ficam fora das vendas do comercial, pela regra de 24/10 (o Dashboard
    conta — o relatório mostra a diferença).
  - Semana de segunda a domingo; o mês de referência é o da segunda-feira
    (a semana de 26/10 fala de outubro fechado). Meta do mês como no
    Dashboard; dias de expediente pela tabela calendario.
  - Sem consulta = regra da tela Vendedoras, com o fuso de Santarém.
    Assinatura e instalação = regras da Esteira (5.7, 5.8 e OS aberta).
  - Base = linha mais recente do crescimento do SGP (card do Dashboard), com
    os suspensos e o fechamento do mês anterior: no começo do mês os
    suspensos por débito sobem e os ativos caem (03/11: 9.205 no fechamento
    de outubro, 8.964 hoje, suspensos de 649 para 875).
  - Fila = `filaDebito` da Prevenção. Refidelização = aditivos válidos.
  - Comparações de foto (base, fila) usam o relatório da semana anterior
    guardado; o primeiro sai sem elas.
- **Status do placar (`placar.ts`):** calculado pela plataforma, não pelo
  Claude. Limites no código e no rodapé do relatório.
- **Textos (`textos.ts`):** Claude com saída estruturada, só com os números
  calculados; não pode inventar número nem contradizer o status. Modelo
  padrão `claude-opus-5-5` (ou `modelo_relatorio` em integracoes_config,
  sistema anthropic). Um ensaio de 26/10 a 01/11 levou 45 s.

## Relatório da diretoria: PDF por e-mail e envio de segunda (04/11/2026)

- **Pedido do Paulo:** o relatório vai em PDF, anexado a um e-mail com o
  resumo no corpo (o formato do e-mail ao CEO que ele aprovou), saindo da
  caixa corporativa dele por enquanto. Na hora, pelo botão, e toda segunda.
- **Caixa que envia:** Administração → Integrações, card "E-mail de envio"
  (integracoes_config, sistema `email`): endereço, senha da caixa, nome do
  remetente, servidor e porta. O interlig.com fica na Locaweb (MX
  mx.core.locaweb.com.br): SMTP `email-ssl.com.br`, porta 465 com SSL. O
  botão "Enviar e-mail de teste" manda para a própria caixa. O remetente vai
  em cópia oculta de cada envio: mandado por SMTP, o e-mail não aparece na
  pasta Enviados.
- **Para quem vai:** `/relatorios`, "Envio por e-mail" (sistema
  `relatorio_semanal`): destinatários, o nome da abertura (padrão "Estevam")
  e o envio automático de segunda, desligado até alguém ligar.
- **PDF (`lib/relatorio-semanal/pdf.ts`):** o Chromium do servidor abre a
  página de impressão `/relatorios/pdf/<id>` e imprime em A4 (escala 0,8,
  rodapé com página). É o mesmo componente da tela em `modo="pdf"`: sem
  campos nem botões, perguntas da reunião como texto, seções de texto
  abrindo página. A página não usa sessão: abre só com link assinado
  (HMAC com o CRON_SECRET) que vence em 10 minutos. Na Vercel,
  `@sparticuz/chromium` 153 + `puppeteer-core` 25.11 (versões casadas),
  fora do bundle e com `bin/` incluído à mão nas rotas `/api/relatorios/**`
  (`outputFileTracingIncludes`); no computador, o Chrome instalado. A fonte
  reserva do Chromium serverless é Open Sans (tem ≈, não tem seta): a
  página de impressão troca "→" por "para". Ensaio local com os dados de
  26/10: 7 páginas, 530 KB, 4 a 8 s.
- **E-mail (`email.ts`, puro e testado):** assunto "Relatório Comercial
  Semanal Interlig – semana de 26/10 a 01/11", abertura com o nome, as
  cinco linhas que o Claude escreve (melhor e pior indicador, base,
  críticos, o que decidir) e o fecho com o anexo ("as perguntas para a
  reunião de segunda estão no fim do PDF"). Sem os textos do Claude, o
  resumo sai dos números.
- **Sem link no e-mail (decisão do Paulo, 04/11):** o PDF anexado é o
  relatório completo; o CEO lê o PDF e não precisa de login. As respostas
  da reunião e o checklist o comercial registra na plataforma, e o
  combinado aparece no relatório da semana seguinte.
- **Envio (`envio.ts`):** cada tentativa fica em `relatorios_envios`
  (migração 0131). Sem o PDF não sai e-mail: pelo botão, quem clicou vê o
  erro.
- **Segunda-feira:** cron `/api/relatorios/rotina` às 11h e às 12h UTC (8h
  e 9h de Santarém). Com o automático ligado, gera o relatório da semana
  que acabou no domingo e manda só para quem ainda não recebeu. Às 8h, se
  os textos do Claude falharem, espera as 9h, que gera de novo; relatório
  gerado no dia e com os textos vai como está. Se a tentativa das 9h não
  sair, vai um aviso só para a caixa que envia, com o motivo.
  `?pdf=<id>` com o CRON_SECRET devolve só o PDF, para conferir o gerador
  em produção.

## CRM: tickets automáticos repetidos e trava por contrato (09/11/2026)

- **Sintoma (Paulo, 09/11):** primeiro o aviso "Novo ticket no CRM" chegava
  repetido; depois, na coluna "Contrato assinado" da Amanda Ribeiro, a
  mesma venda (Karla India Souza Caçador, #23116) aparecia 11 vezes.
- **Causa:** a rotina `criarTicketsDeVendasSgp` lia "todos os tickets de 45
  dias" com `.limit(4000)`, mas a API devolve no máximo 1.000 linhas. Sem
  enxergar o automático que já existia, criava outro a cada leitura (cron
  de 5 min e cada abertura do /crm, que roda `executarRotinasCrm`). Onde
  havia ticket real o descarte apagava o novo (daí os avisos repetidos);
  onde não havia, eles se acumulavam: 9 vendas de 26/09 a 09/11 com 2 a 19
  tickets, todos "convertidos", 90 a mais. Corrigido em e72dc59 (consulta
  direta pelo contrato, todas as páginas).
- **Limpeza e trava (migração 0132):** em cada contrato só com `sgp_auto`
  fica um (o que tem interação; senão o que tem vendedora; senão o mais
  antigo). Sai só quem não tem nada apontando para ele, e os avisos dos que
  saem viram lidos. O índice único `tickets_sgp_auto_um_por_contrato` impede
  dois automáticos no mesmo contrato mesmo com duas execuções ao mesmo
  tempo: a segunda gravação falha e a rotina segue. Em produção a 0132 roda
  pelo script `limpar-tickets-repetidos.mjs` (pasta de backups), que guarda
  as linhas apagadas antes, na mesma transação.
- **Vendedora herdada do contrato:** `herdarVendedoraDoContrato` não fazia
  nada desde o Meu Dia (0116): tickets tem duas ligações com contratos e a
  consulta sem o nome da ligação falhava (PGRST201) em silêncio. Agora usa
  `contratos!tickets_contrato_id_fkey`; havia 3 vendas automáticas sem
  vendedora no CRM (Vandesson #23007 e Grazielly #23113, da Damely; Edim
  #23098, da Karoline).
- **Lembretes:** `despacharLembretes` roda nas rotinas e no sino de cada
  pessoa online (15 s). Duas chamadas juntas mandavam o mesmo lembrete duas
  vezes; agora a ação é reservada (`notificado_em`) antes do aviso, e só
  quem reserva avisa.

## Módulos desativados: Performance Comercial, Setor Corporativo e Qualidade (13/11/2026)

O Paulo pediu para deixar a plataforma mais leve tirando três módulos.

- **Saiu do código:** telas, menu, rotas de API e componentes de cada um:
  - Performance Comercial: `/performance`, a TV `/tv/performance` e o cron `/api/performance/rotina`, que rodava a cada 10 min (coleta do chat, IA e alertas);
  - Setor Corporativo: `/corporativo` e o cartão "Planos do Setor Corporativo" na Administração;
  - Qualidade: `/qualidade`.
- **Endereços antigos:** favoritos e avisos que apontavam para esses endereços agora vão para a tela inicial do perfil (redirecionamento no `next.config.mjs`).
- **O que outros módulos usavam da Performance:** o relatório da diretoria usava duas funções dela. A leitura paginada foi para `lib/supabase/paginar.ts` e os dias úteis para `lib/relatorio-semanal/dias-uteis.ts`.
- **O banco não mudou.** As tabelas e os dados continuam lá: conversas e análises do chat, follow-ups, alertas, metas da Performance, `config_comercial.performance`, visitas do corporativo e `planos.setor_corporativo`. Elas só deixam de receber dados novos.
- **Perfil "Agente corporativo":** continua existindo, com Meu painel, Minhas vendas, Minha comissão, CRM, Esteira e InterChat.
- **Para reativar:** reverter o commit desta mudança. Como os dados ficaram, as telas voltam com o histórico guardado. Ao religar, conferir a coleta do chat, que ficou parada desde a desativação.
