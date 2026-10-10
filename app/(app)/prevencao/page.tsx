import { redirect } from "next/navigation";
import { AlertTriangle, Building2, ExternalLink, Headset, MessageCircle, PieChart, PhoneOff, Wallet } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  efeitoContatos,
  filaDebito,
  filaInsatisfacao,
  motivosCancelamento,
  pedidosCancelamento,
  type LinhaDebito,
  type LinhaInsatisfacao,
  type UltimoContato,
} from "@/lib/prevencao/dados";
import { PERFIS_OPERAM, ROTULO_RESULTADO } from "@/lib/prevencao/resultados";
import { RegistrarContato } from "./registrar-contato";

export const dynamic = "force-dynamic";

type Aba = "debito" | "pedidos" | "insatisfacao" | "motivos";
type Busca = { aba?: string; unidade?: string; segmento?: string; faixa?: string; ver?: string; mes?: string };

const UNIDADES = ["Altamira", "Vitória do Xingu", "Brasil Novo"];
const FAIXAS = [
  { chave: "16-30", rotulo: "16 a 30 dias", de: 16, ate: 30 },
  { chave: "31-60", rotulo: "31 a 60 dias", de: 31, ate: 60 },
  { chave: "61-90", rotulo: "61 a 90 dias", de: 61, ate: 90 },
  { chave: "90+", rotulo: "Mais de 90 dias", de: 91, ate: 99_999 },
];
const LIMITE_LISTA = 150;
const num = (v: number) => v.toLocaleString("pt-BR");
const pctTxt = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");

/**
 * Prevenção de cancelamento (10/10/2026) — desenho aprovado pelo gestor a
 * partir do teste retroativo: débito antes do lote, pedidos x retenção,
 * insatisfação (2+ chamados) e motivos. Rede neutra, permutas e órgãos
 * públicos ficam fora; CNPJ e planos corporativos têm filtro próprio.
 */
export default async function PrevencaoPage({ searchParams }: { searchParams: Busca }) {
  const usuario = await exigirPerfil(["gestor", "direcao", "agente_retencao", "agente_atendimento", "supervisor"]);
  const podeOperar = PERFIS_OPERAM.includes(usuario.perfil);

  // coordenação de unidade (Brasil Novo, Vitória do Xingu) vê só a própria base
  let unidadeFixa: string | null = null;
  if (usuario.perfil === "supervisor") {
    const { data: pop } = usuario.pop_id
      ? await criarClienteAdmin().from("pops").select("nome").eq("id", usuario.pop_id).maybeSingle()
      : { data: null };
    const nome = String(pop?.nome ?? "");
    if (!["Brasil Novo", "Vitória do Xingu"].includes(nome)) redirect("/dashboard");
    unidadeFixa = nome;
  }
  const unidade = unidadeFixa ?? (UNIDADES.includes(searchParams.unidade ?? "") ? searchParams.unidade! : null);
  const corporativo = searchParams.segmento === "corporativo";
  const aba: Aba = (["debito", "pedidos", "insatisfacao", "motivos"] as const).includes(searchParams.aba as Aba)
    ? (searchParams.aba as Aba)
    : "debito";

  const href = (extra: Partial<Busca>) => {
    const p = new URLSearchParams();
    const tudo: Busca = { aba, unidade: unidadeFixa ? undefined : unidade ?? undefined, segmento: corporativo ? "corporativo" : undefined, ...extra };
    for (const [k, v] of Object.entries(tudo)) if (v) p.set(k, v);
    if (p.get("aba") === "debito") p.delete("aba");
    const q = p.toString();
    return q ? `/prevencao?${q}` : "/prevencao";
  };
  const filtra = <T extends { pop: string | null; corporativo: boolean }>(l: T[]) =>
    l.filter((x) => (!unidade || x.pop === unidade) && (!corporativo || x.corporativo));
  const linkTemplate = await templateLinkSgp();

  return (
    <>
      <CabecalhoPagina
        titulo={unidadeFixa ? `Prevenção de cancelamento · ${unidadeFixa}` : "Prevenção de cancelamento"}
        descricao="Quem está perto de cancelar e o que fazer agora. Base do SGP; rede neutra, permutas e órgãos públicos ficam fora."
      />

      {/* filtros: unidade e segmento valem para todas as abas */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {!unidadeFixa && (
          <div className="flex flex-wrap gap-1.5">
            {[null, ...UNIDADES].map((u) => (
              <a
                key={u ?? "todas"}
                href={href({ unidade: u ?? undefined, faixa: searchParams.faixa, ver: searchParams.ver, mes: searchParams.mes })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  unidade === u ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                {u ?? "Todas as unidades"}
              </a>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 sm:ml-auto">
          <a
            href={href({ segmento: undefined, faixa: searchParams.faixa, ver: searchParams.ver, mes: searchParams.mes })}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium", !corporativo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            Todos os clientes
          </a>
          <a
            href={href({ segmento: "corporativo", faixa: searchParams.faixa, ver: searchParams.ver, mes: searchParams.mes })}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium",
              corporativo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            <Building2 className="h-3.5 w-3.5" /> CNPJ e corporativos
          </a>
        </div>
      </div>

      <nav className="mb-5 inline-flex max-w-full flex-wrap gap-1 rounded-xl border bg-muted/50 p-1" aria-label="Seções da prevenção">
        {(
          [
            ["debito", "Débito", <Wallet key="i" className="h-4 w-4" />],
            ["pedidos", "Pedidos de cancelamento", <AlertTriangle key="i" className="h-4 w-4" />],
            ["insatisfacao", "Insatisfação", <Headset key="i" className="h-4 w-4" />],
            ["motivos", "Motivos", <PieChart key="i" className="h-4 w-4" />],
          ] as [Aba, string, React.ReactNode][]
        ).map(([chave, rotulo, icone]) => {
          const ativa = aba === chave;
          return (
            <a
              key={chave}
              href={href({ aba: chave })}
              aria-current={ativa ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4",
                ativa ? "bg-card text-primary shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
              )}
            >
              <span className={ativa ? "text-primary" : "text-muted-foreground"}>{icone}</span>
              {rotulo}
            </a>
          );
        })}
      </nav>

      {aba === "debito" && (
        <AbaDebito
          linhas={filtra(await filaDebito())}
          efeito={await efeitoContatos("debito")}
          faixa={FAIXAS.find((f) => f.chave === searchParams.faixa) ?? null}
          verTodos={searchParams.ver === "todos"}
          href={href}
          podeOperar={podeOperar}
          linkTemplate={linkTemplate}
        />
      )}
      {aba === "insatisfacao" && (
        <AbaInsatisfacao
          linhas={filtra(await filaInsatisfacao())}
          efeito={await efeitoContatos("insatisfacao")}
          verTodos={searchParams.ver === "todos"}
          href={href}
          podeOperar={podeOperar}
          linkTemplate={linkTemplate}
        />
      )}
      {aba === "pedidos" && <AbaPedidos mes={searchParams.mes} unidade={unidade} corporativo={corporativo} href={href} linkTemplate={linkTemplate} />}
      {aba === "motivos" && <AbaMotivos unidade={unidade} corporativo={corporativo} />}
    </>
  );
}

// ---------------------------------------------------------------------------

function Kpi({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe?: string; tom?: "vermelho" | "amarelo" | "verde" }) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm",
        tom === "vermelho" && "border-farol-vermelho/30 bg-farol-vermelho/5",
        tom === "amarelo" && "border-farol-amarelo/40 bg-farol-amarelo/5",
        tom === "verde" && "border-farol-verde/30 bg-farol-verde/5"
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "break-words text-2xl font-bold tabular-nums xl:text-3xl",
          tom === "vermelho" && "text-farol-vermelho",
          tom === "amarelo" && "text-amber-600",
          tom === "verde" && "text-farol-verde"
        )}
      >
        {valor}
      </p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}

function Contato({ c }: { c: UltimoContato | null }) {
  if (!c) return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><PhoneOff className="h-3.5 w-3.5" /> Sem contato</span>;
  const bom = ["acordo", "ja_pagou", "resolvido", "prometeu_pagar", "encaminhado_tecnica"].includes(c.resultado);
  return (
    <span className="text-xs" title={c.observacao ?? undefined}>
      <span className={cn("rounded-full px-2 py-0.5 font-medium", bom ? "bg-farol-verde/15 text-farol-verde" : "bg-farol-amarelo/15 text-amber-700")}>
        {ROTULO_RESULTADO[c.resultado]}
      </span>{" "}
      <span className="text-muted-foreground">
        {formatarData(c.em.slice(0, 10))}
        {c.por ? ` · ${c.por.split(" ")[0]}` : ""}
        {c.observacao ? ` · ${c.observacao}` : ""}
      </span>
    </span>
  );
}

function Acoes({
  linha,
  fila,
  podeOperar,
  linkTemplate,
}: {
  linha: LinhaDebito | LinhaInsatisfacao;
  fila: "debito" | "insatisfacao";
  podeOperar: boolean;
  linkTemplate: string;
}) {
  const sgp = aplicarLinkSgp(linkTemplate, { clienteId: linha.sgpClienteId, contratoId: linha.sgpContratoId });
  const fone = (linha.telefone ?? "").replace(/\D/g, "");
  const whats = fone.length >= 10 ? `https://wa.me/55${fone.replace(/^55(?=\d{10,11}$)/, "")}` : null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sgp && (
        <a href={sgp} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-muted">
          SGP <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {whats && (
        <a href={whats} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-muted">
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </a>
      )}
      {podeOperar && <RegistrarContato contrato={linha.sgpContratoId} fila={fila} />}
    </div>
  );
}

function Chip({ children, tom }: { children: React.ReactNode; tom?: "vermelho" | "amarelo" | "azul" | "cinza" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        tom === "vermelho" && "bg-farol-vermelho/10 text-farol-vermelho",
        tom === "amarelo" && "bg-farol-amarelo/15 text-amber-700",
        tom === "azul" && "bg-sky-500/10 text-sky-700",
        (!tom || tom === "cinza") && "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

/** pendente = sem contato registrado nos últimos 7 dias */
const pendente = (c: UltimoContato | null) => !c || Date.now() - Date.parse(c.em) > 7 * 86_400_000;

function Filtro({ ativo, href, children }: { ativo: boolean; href: string; children: React.ReactNode }) {
  return (
    <a href={href} className={cn("rounded-full border px-3 py-1 text-xs font-medium", ativo ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
      {children}
    </a>
  );
}

// ---------------------------------------------------------------------------

function AbaDebito({
  linhas,
  efeito,
  faixa,
  verTodos,
  href,
  podeOperar,
  linkTemplate,
}: {
  linhas: LinhaDebito[];
  efeito: Awaited<ReturnType<typeof efeitoContatos>>;
  faixa: (typeof FAIXAS)[number] | null;
  verTodos: boolean;
  href: (b: Partial<Busca>) => string;
  podeOperar: boolean;
  linkTemplate: string;
}) {
  const porFaixa = FAIXAS.map((f) => {
    const l = linhas.filter((x) => x.diasAtraso >= f.de && x.diasAtraso <= f.ate);
    return { ...f, qtd: l.length, mensal: l.reduce((s, x) => s + x.valor, 0) };
  });
  const maxFaixa = Math.max(1, ...porFaixa.map((f) => f.qtd));
  const naFaixa = faixa ? linhas.filter((x) => x.diasAtraso >= faixa.de && x.diasAtraso <= faixa.ate) : linhas;
  const lista = (verTodos ? naFaixa : naFaixa.filter((x) => pendente(x.contato))).sort(
    (a, b) => b.valor - a.valor || b.diasAtraso - a.diasAtraso
  );
  const semContato = linhas.filter((x) => pendente(x.contato)).length;

  return (
    <>
      <Nota>
        Clientes com boleto vencido há mais de 15 dias. No teste com os dados de 2026, <strong>1 em cada 3</strong> desses
        clientes foi cancelado em até 60 dias — o débito é a maior causa de cancelamento da base e a empresa cancela os
        suspensos em lotes. Negocie antes do lote. A lista começa pela maior mensalidade (a receita que se perde).
      </Nota>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Clientes na fila" valor={num(linhas.length)} detalhe={`${formatarMoeda(linhas.reduce((s, x) => s + x.valor, 0))}/mês em risco`} tom="vermelho" />
        <Kpi rotulo="Em aberto" valor={formatarMoeda(linhas.reduce((s, x) => s + x.valorAberto, 0))} detalhe={`${num(linhas.reduce((s, x) => s + x.boletos, 0))} boletos vencidos`} />
        <Kpi rotulo="Sem contato (7 dias)" valor={num(semContato)} detalhe="ninguém ligou na última semana" tom={semContato > 0 ? "amarelo" : "verde"} />
        <Kpi
          rotulo="Contatados (60 dias)"
          valor={num(efeito.contatados)}
          detalhe={`${num((efeito.porResultado.acordo ?? 0) + (efeito.porResultado.ja_pagou ?? 0) + (efeito.porResultado.prometeu_pagar ?? 0))} acordos/promessas · ${num(efeito.canceladosDepois)} cancelados depois`}
        />
      </div>

      <section className="mb-5 rounded-xl border bg-card p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold">Tempo de atraso</p>
        <div className="space-y-2">
          {porFaixa.map((f) => (
            <a key={f.chave} href={href({ faixa: faixa?.chave === f.chave ? undefined : f.chave, ver: verTodos ? "todos" : undefined })} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1 py-0.5 text-sm hover:bg-muted/50 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
              <span className={cn("text-xs sm:text-sm", faixa?.chave === f.chave && "font-semibold text-primary")}>{f.rotulo}</span>
              <span className="h-3 overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full rounded-full", f.de > 90 ? "bg-farol-vermelho" : f.de > 60 ? "bg-orange-500" : f.de > 30 ? "bg-amber-400" : "bg-sky-500")} style={{ width: `${(f.qtd / maxFaixa) * 100}%` }} />
              </span>
              <span className="text-right text-xs tabular-nums sm:text-sm">
                <strong>{num(f.qtd)}</strong> <span className="text-muted-foreground">· {formatarMoeda(f.mensal)}/mês</span>
              </span>
            </a>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Clique numa faixa para filtrar a lista.</p>
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Filtro ativo={!verTodos} href={href({ faixa: faixa?.chave })}>Pendentes de contato</Filtro>
        <Filtro ativo={verTodos} href={href({ faixa: faixa?.chave, ver: "todos" })}>Todos</Filtro>
        {faixa && <Filtro ativo href={href({ ver: verTodos ? "todos" : undefined })}>{faixa.rotulo} ✕</Filtro>}
        <span className="ml-auto text-xs text-muted-foreground">{num(lista.length)} clientes{lista.length > LIMITE_LISTA ? ` · mostrando ${LIMITE_LISTA}` : ""}</span>
      </div>
      <ul className="divide-y rounded-xl border bg-card shadow-sm">
        {lista.slice(0, LIMITE_LISTA).map((l) => (
          <li key={l.sgpContratoId} className="flex flex-col gap-2 p-4 lg:flex-row lg:items-start lg:gap-4">
            <div className="min-w-0 lg:w-[34%]">
              <p className="truncate font-semibold">{l.cliente}</p>
              <p className="truncate text-xs text-muted-foreground">
                Contrato {l.sgpContratoId} · {l.pop ?? "—"} · {l.plano ?? "plano não identificado"}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                <Chip tom={l.status === "suspenso" ? "vermelho" : "amarelo"}>{l.status === "suspenso" ? "Suspenso" : "Ativo"}</Chip>
                {l.corporativo && <Chip tom="azul">CNPJ/corporativo</Chip>}
                {l.suporte90d > 0 && <Chip>{l.suporte90d} chamado{l.suporte90d > 1 ? "s" : ""} de suporte em 90 dias</Chip>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm lg:w-[30%]">
              <div>
                <p className="text-[11px] uppercase text-muted-foreground">Atraso</p>
                <p className={cn("font-semibold tabular-nums", l.diasAtraso > 60 ? "text-farol-vermelho" : "text-amber-700")}>{l.diasAtraso} dias</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-muted-foreground">Em aberto</p>
                <p className="font-semibold tabular-nums">{formatarMoeda(l.valorAberto)}</p>
                <p className="text-[11px] text-muted-foreground">{l.boletos} boleto{l.boletos > 1 ? "s" : ""}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-muted-foreground">Mensal</p>
                <p className="font-semibold tabular-nums">{formatarMoeda(l.valor)}</p>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Contato c={l.contato} />
              {l.ultimaPromessa && <p className="text-xs text-muted-foreground">Prometeu pagar pela URA em {formatarData(l.ultimaPromessa.slice(0, 10))}</p>}
              <Acoes linha={l} fila="debito" podeOperar={podeOperar} linkTemplate={linkTemplate} />
            </div>
          </li>
        ))}
        {lista.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nenhum cliente nesta lista. 🎉</li>}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------

function AbaInsatisfacao({
  linhas,
  efeito,
  verTodos,
  href,
  podeOperar,
  linkTemplate,
}: {
  linhas: LinhaInsatisfacao[];
  efeito: Awaited<ReturnType<typeof efeitoContatos>>;
  verTodos: boolean;
  href: (b: Partial<Busca>) => string;
  podeOperar: boolean;
  linkTemplate: string;
}) {
  const lista = verTodos ? linhas : linhas.filter((x) => pendente(x.contato));
  const resumoTipos = (tipos: string[]) => {
    const c = new Map<string, number>();
    for (const t of tipos) {
      const k = t.replace(/^Suporte - /, "").replace(/^Chamado /, "");
      c.set(k, (c.get(k) ?? 0) + 1);
    }
    return [...c].sort((a, b) => b[1] - a[1]);
  };
  return (
    <>
      <Nota>
        Clientes ativos com <strong>2 ou mais chamados de suporte nos últimos 30 dias</strong>. Entre os que cancelaram por
        insatisfação, metade tinha aberto chamado antes (na base inteira, 1 em cada 5). É uma ligação de recuperação do
        serviço — confirmar se o problema foi resolvido — e não de retenção. A precisão é baixa: use como apoio.
      </Nota>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Clientes com 2+ chamados" valor={num(linhas.length)} detalhe="últimos 30 dias" tom="amarelo" />
        <Kpi rotulo="Com 3+ chamados" valor={num(linhas.filter((x) => x.chamados >= 3).length)} detalhe="prioridade" tom="vermelho" />
        <Kpi rotulo="Sem contato (7 dias)" valor={num(linhas.filter((x) => pendente(x.contato)).length)} />
        <Kpi
          rotulo="Contatados (60 dias)"
          valor={num(efeito.contatados)}
          detalhe={`${num(efeito.porResultado.resolvido ?? 0)} resolvidos · ${num(efeito.canceladosDepois)} cancelados depois`}
        />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Filtro ativo={!verTodos} href={href({})}>Pendentes de contato</Filtro>
        <Filtro ativo={verTodos} href={href({ ver: "todos" })}>Todos</Filtro>
        <span className="ml-auto text-xs text-muted-foreground">{num(lista.length)} clientes{lista.length > LIMITE_LISTA ? ` · mostrando ${LIMITE_LISTA}` : ""}</span>
      </div>
      <ul className="divide-y rounded-xl border bg-card shadow-sm">
        {lista.slice(0, LIMITE_LISTA).map((l) => (
          <li key={l.sgpContratoId} className="flex flex-col gap-2 p-4 lg:flex-row lg:items-start lg:gap-4">
            <div className="min-w-0 lg:w-[34%]">
              <p className="truncate font-semibold">{l.cliente}</p>
              <p className="truncate text-xs text-muted-foreground">
                Contrato {l.sgpContratoId} · {l.pop ?? "—"} · {l.plano ?? "plano não identificado"}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {l.corporativo && <Chip tom="azul">CNPJ/corporativo</Chip>}
                {l.ativacao && <Chip>cliente desde {formatarData(l.ativacao)}</Chip>}
              </div>
            </div>
            <div className="lg:w-[30%]">
              <p className={cn("text-sm font-semibold", l.chamados >= 3 ? "text-farol-vermelho" : "text-amber-700")}>
                {l.chamados} chamados em 30 dias
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {resumoTipos(l.tipos).map(([t, q]) => (
                  <Chip key={t}>{t}{q > 1 ? ` ×${q}` : ""}</Chip>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Último: {formatarDataHora(l.ultimo)}</p>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Contato c={l.contato} />
              <Acoes linha={l} fila="insatisfacao" podeOperar={podeOperar} linkTemplate={linkTemplate} />
            </div>
          </li>
        ))}
        {lista.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nenhum cliente nesta lista. 🎉</li>}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------

async function AbaPedidos({
  mes,
  unidade,
  corporativo,
  href,
  linkTemplate,
}: {
  mes?: string;
  unidade: string | null;
  corporativo: boolean;
  href: (b: Partial<Busca>) => string;
  linkTemplate: string;
}) {
  const agora = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
  const ref = /^\d{4}-\d{2}$/.test(mes ?? "") ? mes! : agora;
  const todos = (await pedidosCancelamento(ref)).filter((p) => (!unidade || p.pop === unidade) && (!corporativo || p.corporativo));
  const passaram = todos.filter((p) => p.passouRetencao);
  const ficaram = todos.filter((p) => p.situacao === "ficou");
  const cancelados = todos.filter((p) => p.situacao === "cancelado");
  const porAtendente = new Map<string, { pedidos: number; semRetencao: number; cancelados: number }>();
  for (const p of todos) {
    const k = p.atendente ?? "(não informado)";
    const a = porAtendente.get(k) ?? { pedidos: 0, semRetencao: 0, cancelados: 0 };
    a.pedidos++;
    if (!p.passouRetencao) a.semRetencao++;
    if (p.situacao === "cancelado") a.cancelados++;
    porAtendente.set(k, a);
  }
  const [a, m] = ref.split("-").map(Number);
  const mesAnt = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
  const mesSeg = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 7);
  const nomeMes = new Date(Date.UTC(a, m - 1, 15))
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <>
      <Nota>
        86% dos clientes que pedem cancelamento estando ativos são cancelados <strong>no mesmo dia</strong>. Não sobra tempo
        para ligar depois: todo pedido precisa passar pela retenção antes de ser executado. Aqui está cada pedido aberto no
        SGP (ocorrência &quot;Cancelamento Contrato&quot;) e se ele passou pela retenção — caso aberto na Retenção da plataforma
        ou ocorrência &quot;Retenção de Cancelamento&quot; no SGP.
      </Nota>
      <div className="mb-4 flex items-center gap-2 text-sm">
        <a href={href({ mes: mesAnt })} className="rounded-md border px-2.5 py-1 hover:bg-muted">‹</a>
        <span className="min-w-[150px] text-center font-semibold">{nomeMes}</span>
        {mesSeg <= agora && <a href={href({ mes: mesSeg })} className="rounded-md border px-2.5 py-1 hover:bg-muted">›</a>}
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Pedidos de cancelamento" valor={num(todos.length)} />
        <Kpi
          rotulo="Passaram pela retenção"
          valor={pctTxt(passaram.length, todos.length)}
          detalhe={`${num(passaram.length)} de ${num(todos.length)}`}
          tom={todos.length && passaram.length / todos.length >= 0.8 ? "verde" : "vermelho"}
        />
        <Kpi rotulo="Ficaram" valor={num(ficaram.length)} detalhe="sem cancelamento 7 dias depois" tom="verde" />
        <Kpi rotulo="Cancelados" valor={num(cancelados.length)} detalhe={`${num(cancelados.filter((p) => !p.passouRetencao).length)} sem passar pela retenção`} tom="vermelho" />
      </div>

      {porAtendente.size > 0 && (
        <section className="mb-5 rounded-xl border bg-card shadow-sm">
          <p className="border-b px-4 py-3 text-sm font-semibold">Quem registrou o pedido no SGP</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Usuário</th>
                  <th className="px-3 py-2 text-right font-medium">Pedidos</th>
                  <th className="px-3 py-2 text-right font-medium">Sem retenção</th>
                  <th className="px-3 py-2 text-right font-medium">Cancelados</th>
                </tr>
              </thead>
              <tbody>
                {[...porAtendente].sort((x, y) => y[1].semRetencao - x[1].semRetencao || y[1].pedidos - x[1].pedidos).map(([nome, v]) => (
                  <tr key={nome} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{nome}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(v.pedidos)}</td>
                    <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", v.semRetencao > 0 && "text-farol-vermelho")}>{num(v.semRetencao)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(v.cancelados)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ul className="divide-y rounded-xl border bg-card shadow-sm">
        {todos.map((p) => {
          const sgp = aplicarLinkSgp(linkTemplate, { clienteId: p.sgpClienteId, contratoId: p.sgpContratoId });
          return (
            <li key={p.sgpContratoId} className="flex flex-col gap-1.5 p-4 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 sm:flex-1">
                <p className="truncate font-semibold">{p.cliente}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Contrato {p.sgpContratoId} · {p.pop ?? "—"} · pedido em {formatarDataHora(p.pedidoEm)}
                  {p.atendente ? ` por ${p.atendente}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {p.corporativo && <Chip tom="azul">CNPJ/corporativo</Chip>}
                <Chip tom={p.passouRetencao ? "azul" : "vermelho"}>{p.passouRetencao ? "Passou pela retenção" : "Sem retenção"}</Chip>
                {p.situacao === "cancelado" ? (
                  <Chip tom="vermelho">Cancelado {formatarData(p.canceladoEm)}{p.motivo ? ` · ${p.motivo.replace(/^Cancelamento - /, "")}` : ""}</Chip>
                ) : p.situacao === "ficou" ? (
                  <span className="rounded-full bg-farol-verde/15 px-2 py-0.5 text-[11px] font-medium text-farol-verde">Ficou</span>
                ) : (
                  <Chip tom="amarelo">Aguardando</Chip>
                )}
                {sgp && (
                  <a href={sgp} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted">
                    SGP <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </li>
          );
        })}
        {todos.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nenhum pedido de cancelamento neste mês.</li>}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------

const COR_MOTIVO: Record<string, string> = {
  "Mudança de Cidade": "bg-sky-500",
  Outros: "bg-slate-400",
  "Sem motivo": "bg-slate-300",
  "Inviabilidade Técnica": "bg-violet-500",
  "Insatisfação com Serviço": "bg-farol-vermelho",
  "Insatisfação com Atendimento": "bg-rose-400",
  Financeiro: "bg-amber-400",
};

async function AbaMotivos({ unidade, corporativo }: { unidade: string | null; corporativo: boolean }) {
  const meses = await motivosCancelamento(6, unidade);
  const total: Record<string, number> = {};
  for (const m of meses) for (const [k, v] of Object.entries(m.porMotivo)) total[k] = (total[k] ?? 0) + v;
  const motivos = Object.entries(total).sort((a, b) => b[1] - a[1]);
  const soma = motivos.reduce((s, [, v]) => s + v, 0);
  const vagos = (total.Outros ?? 0) + (total["Sem motivo"] ?? 0);
  const maxMes = Math.max(1, ...meses.map((m) => m.voluntarios + m.debito));
  const nome = (mes: string) => {
    const [a, m] = mes.split("-").map(Number);
    return `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][m - 1]}/${String(a).slice(2)}`;
  };
  return (
    <>
      {corporativo && <Nota>O filtro de CNPJ e corporativos não se aplica a esta aba — os motivos são da base inteira{unidade ? ` de ${unidade}` : ""}.</Nota>}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Voluntários (6 meses)" valor={num(meses.reduce((s, m) => s + m.voluntarios, 0))} detalhe="cliente ativo pediu para sair" />
        <Kpi rotulo="Por débito (6 meses)" valor={num(meses.reduce((s, m) => s + m.debito, 0))} detalhe="cancelado estando suspenso" tom="vermelho" />
        <Kpi rotulo="Motivo vago" valor={pctTxt(vagos, soma)} detalhe={`"Outros" ou sem motivo: ${num(vagos)} de ${num(soma)}`} tom={soma && vagos / soma > 0.2 ? "amarelo" : "verde"} />
        <Kpi rotulo="Mudança de cidade" valor={pctTxt(total["Mudança de Cidade"] ?? 0, soma)} detalhe="dos voluntários" />
      </div>

      <section className="mb-5 rounded-xl border bg-card p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold">Cancelamentos por mês</p>
        <div className="space-y-2">
          {meses.map((m) => (
            <div key={m.mes} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span className="text-xs text-muted-foreground">{nome(m.mes)}</span>
              <span className="flex h-4 overflow-hidden rounded-full bg-muted">
                <span className="bg-sky-500" style={{ width: `${(m.voluntarios / maxMes) * 100}%` }} title={`Voluntários: ${m.voluntarios}`} />
                <span className="bg-farol-vermelho" style={{ width: `${(m.debito / maxMes) * 100}%` }} title={`Débito: ${m.debito}`} />
              </span>
              <span className="text-right text-xs tabular-nums">
                <strong className="text-sky-700">{m.voluntarios}</strong> · <strong className="text-farol-vermelho">{m.debito}</strong>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Voluntários (estava ativo)</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-farol-vermelho" /> Débito (estava suspenso — saem em lotes)</span>
        </p>
      </section>

      <section className="mb-5 rounded-xl border bg-card p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold">Motivo dos cancelamentos voluntários — últimos 6 meses</p>
        <div className="space-y-2">
          {motivos.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[220px_minmax(0,1fr)_auto]">
              <span className="truncate text-xs sm:text-sm">{k}</span>
              <span className="h-3 overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full rounded-full", COR_MOTIVO[k] ?? "bg-slate-500")} style={{ width: `${(v / Math.max(1, motivos[0]?.[1] ?? 1)) * 100}%` }} />
              </span>
              <span className="text-right text-xs tabular-nums"><strong>{v}</strong> <span className="text-muted-foreground">({pctTxt(v, soma)})</span></span>
            </div>
          ))}
          {motivos.length === 0 && <p className="text-sm text-muted-foreground">Sem cancelamentos voluntários no período.</p>}
        </div>
      </section>

      <Nota>
        <strong>&quot;Outros&quot; esconde a causa real.</strong> Para a prevenção aprender, o motivo precisa ser específico no
        SGP — por exemplo: preço / foi para concorrente, instabilidade, mudança dentro da cidade sem viabilidade, perda de
        renda. E na mudança de cidade, vale perguntar o destino: se for Altamira, Vitória do Xingu ou Brasil Novo, é
        transferência, não cancelamento.
      </Nota>
    </>
  );
}
