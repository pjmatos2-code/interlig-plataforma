# Plataforma de Inteligência Comercial — Interlig

Vendas, metas, comissionamento, qualidade da venda e CRM próprio da Interlig, num painel único
com visão por perfil (gestor, supervisor, vendedora).

Especificação: [`docs/PRD.md`](docs/PRD.md) · Regras para o Claude Code: [`CLAUDE.md`](CLAUDE.md)

**Estado atual: Fundação (Prompt 1).** Banco completo com RLS, autenticação com os 3 perfis,
navegação por perfil e massa de teste fictícia. As telas de indicador entram na Fase 1.

---

## 1. Pré-requisito: Node.js

Esta máquina ainda não tem Node instalado. Baixe o instalador **LTS (20 ou 22)** em
<https://nodejs.org/pt-br> e instale (pede a senha do Mac). Depois confira:

```bash
node -v && npm -v
```

## 2. Projeto no Supabase

1. Crie um projeto em <https://supabase.com> (plano gratuito serve). Anote a senha do banco.
2. Vá em **Settings → API** e copie:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (**nunca** vai para o navegador nem para o Git)
3. Em **Authentication → Providers → Email**, deixe *Email* ligado e **Confirm email** desligado
   (os usuários são criados já confirmados pelo script). Não existe autocadastro: o cadastro é
   sempre por convite do gestor (PRD seção 2).

## 3. Variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencha as três chaves do Supabase. As variáveis do SGP e do SZ Chat ficam vazias por enquanto —
`SGP_MODE=mock` e `SZCHAT_MODE=mock` mantêm tudo rodando com dados fictícios até as credenciais
chegarem.

## 4. Banco: migrações e seed

No painel do Supabase, **SQL Editor → New query**, rode **nesta ordem**, um arquivo por vez:

1. `supabase/migrations/0001_schema.sql` — tabelas da seção 7.2 do PRD
2. `supabase/migrations/0002_rls.sql` — matriz de acesso da seção 2, aplicada por RLS
3. `supabase/migrations/0003_regras.sql` — regras inegociáveis (ticket não some, fechamento com
   desfecho, snapshot de comissão imutável) e as views de leitura
4. `supabase/seed.sql` — massa de teste

> O `seed.sql` é gerado, não escrito à mão. Para regerar (por exemplo depois de virar o mês):
> `npm run seed:gerar`. Ele apaga a massa anterior e recria tudo em uma transação.

O que a massa traz: 3 POPs (Santarém, Itaituba, Oriximiná), 8 vendedoras, 6 planos de R$ 79,90 a
R$ 149,90, ~680 contratos nos últimos 12 meses com sazonalidade, 80 do mês corrente em vários
status da esteira, ~8% de cancelamentos (parte em menos de 90 dias, para testar churn precoce),
~2.400 títulos com ~7% de inadimplência na 1ª fatura, 150 tickets de CRM em todas as etapas e
desfechos, metas do mês vigente e uma regra de comissão com 3 degraus.

## 5. Instalar e rodar

```bash
npm install
```

```bash
npm run dev
```

Abra <http://localhost:3000>.

## 6. Criar os 3 usuários de teste

Com o `.env.local` preenchido e o seed já carregado:

```bash
npm run usuarios:criar
```

O script cria os usuários no Supabase Auth, insere a linha correspondente em `usuarios` e faz os
vínculos (supervisor ↔ POP, vendedora ↔ vendedora do SGP). Rodar de novo é seguro: reaproveita
quem já existe e só redefine a senha.

| Perfil | E-mail | Senha | Enxerga |
|---|---|---|---|
| Gestor | `gestor@interlig.test` | `Interlig@2026` | tudo: todas as POPs, financeiro, CRM inteiro |
| Supervisor | `supervisor@interlig.test` | `Interlig@2026` | só a POP Santarém — inclusive os títulos dela |
| Vendedora | `vendedora@interlig.test` | `Interlig@2026` | só a carteira da Ana Paula Ferreira, sem financeiro |

Para trocar a senha padrão: `SENHA_TESTE='outra-senha' npm run usuarios:criar`.

### Como conferir que a RLS está valendo

Entre com os três e compare o painel de escopo na home. Os números **têm** que mudar: o gestor vê
todos os contratos, o supervisor só os da POP dele, e a vendedora só os dela — com "títulos
financeiros" zerado, porque a política do banco nega a tabela para o perfil vendedora. Isso não é
filtro de tela: é o Postgres recusando as linhas.

---

## Estrutura

```
app/
  (app)/            telas autenticadas, com o shell e a navegação por perfil
  login/            autenticação por e-mail/senha
  api/sair/         encerramento de sessão
components/
  ui/               base visual (shadcn/ui)
  layout/           shell, cabeçalho de página e painel de escopo
lib/
  auth.ts           usuário da sessão, exigência de perfil e rota inicial
  nav.ts            navegação derivada da matriz da seção 2 do PRD
  format.ts         moeda, datas e fuso America/Santarem
  supabase/         clientes de navegador, servidor e middleware
supabase/
  migrations/       schema, RLS e regras de negócio
  seed.sql          massa fictícia (gerada por scripts/gerar_seed.py)
scripts/
  gerar_seed.py     gerador determinístico do seed
  criar-usuarios.mjs cria os 3 usuários de teste e faz os vínculos
```

## Próximo passo (Prompt 2)

Fase 0 do PRD: `scripts/sgp-discovery.ts` e o cliente do SGP atrás da interface
(`SgpApiClient` / `SgpMockClient`, selecionados por `SGP_MODE`), com as amostras de resposta
salvas em `docs/sgp-samples/`. Só depois disso as telas de indicador da Fase 1.
