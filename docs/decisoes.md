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
