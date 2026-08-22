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
