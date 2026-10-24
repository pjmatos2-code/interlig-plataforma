# Performance Comercial — dados pessoais (LGPD)

## Finalidade

Gestão da operação comercial: medir esforço, resultado e qualidade do time,
priorizar retornos a clientes e encontrar oportunidades esquecidas. Os
indicadores são **apoio à gestão** e não podem ser usados isoladamente para
decisões trabalhistas ou disciplinares (aviso nas telas e nas exportações).

## Quais dados e de quem

| Titular | Dados | Origem |
|---|---|---|
| Clientes e interessados | mensagens das conversas comerciais (texto mascarado), horários, telefone do contato para vincular ao lead | SZ Chat (conta robô, só leitura) |
| Clientes | dados de contrato, 1ª fatura e OS já existentes na plataforma | SGP (sync existente) |
| Colaboradores | ações no CRM, mensagens no chat, metas, afastamentos (tipo e período, sem motivo de saúde), data de admissão | CRM, SZ Chat, cadastro do gestor |

Base legal sugerida (confirmar com o jurídico): legítimo interesse do
controlador na gestão da atividade comercial e execução do contrato com o
cliente; para colaboradores, gestão do contrato de trabalho.

## Minimização

- Na **coleta**, antes de gravar: CPF, CNPJ, telefone, e-mail, CEP, números longos,
  coordenadas e links de mapa viram marcadores (`[CPF]`, `[TELEFONE]`…), e o
  nome do contato é trocado por `[CLIENTE]` (`lib/performance/mascara.ts`).
- Na **exibição**, o nome do cliente do lead, o nome que ele digitou quando
  perguntado e os bairros aparecem como `[omitido]`.
- Para a **IA** vai só a conversa já mascarada, sem dados de cadastro. A saída
  passa por regra de privacidade no prompt e por filtro que apaga bairros e
  nomes do cliente (`apagarTermos`).
- Depois da retenção (padrão **180 dias**, mínimo técnico de 7) a rotina diária
  apaga o texto das mensagens e o texto livre das análises da IA (resumo,
  justificativas, sinais, evidências); ficam tempos, contagens e as
  classificações estruturadas (temperatura, objeções, situação, notas). As
  tarefas de follow-up sugeridas pela IA são registro operacional, como as do
  CRM, e não entram nessa limpeza.

## Quem acessa

| Conteúdo | Quem vê |
|---|---|
| Indicadores e rankings | gestor, diretoria, supervisor (só o time), gerente de unidade (só a POP); vendedor vê os próprios números e só a posição no ranking |
| Conteúdo das conversas (mensagens e resumos da IA) | gestor sempre; diretoria e supervisores só se o gestor liberar nas Configurações; vendedor só as próprias |
| Exportações | gestor, diretoria, supervisor, gerente de unidade (vendedor não exporta) |
| Versão para TV | só números agregados (sem nome de cliente nem nota individual) |

Autorização sempre no servidor; tabelas novas com RLS ligada e sem política de
leitura pelo navegador (acesso só pelo servidor).

## Rastreabilidade

`auditoria_performance` registra: alteração de configurações (antes/depois),
metas, afastamentos, admissão, revisões da IA, rodadas manuais de rotina,
**abertura de conversa** e **exportação** (quem, quando, qual relatório).

## Fornecedores

- **Supabase** (banco) e **Vercel** (hospedagem): já usados pela plataforma.
- **Anthropic** (IA): recebe a conversa mascarada apenas quando a análise está
  ligada (desligada por padrão) ou numa amostra manual do gestor. Verificar no
  contrato vigente as condições de retenção e uso de dados da API.

## Fluxo dos dados

SZ Chat → coletor (máscara) → `conversas_mensagens` (texto com retenção) →
métricas por conversa → telas. Se a IA estiver ligada: conversa mascarada →
Anthropic → saída validada por schema e filtrada → `analises_conversa` →
telas (marcada como inferência, revisável por humano).

## Direitos do titular

Pedido de acesso ou eliminação: localizar pelo telefone/lead em
`conversas_atendimento` e `conversas_mensagens`; o texto pode ser apagado
(`texto = null`) sem quebrar as métricas.
