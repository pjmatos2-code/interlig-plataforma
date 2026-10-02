import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarPainelComissoes } from "@/lib/comissao/painel";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { hojeIso, mesAtras, primeiroDiaDoMes } from "@/lib/datas";
import { Card, CardContent } from "@/components/ui/card";
import {
  CartaoResultadoAgente,
  ConferenciaAgente,
  dataHora,
  nomeMes,
} from "@/components/comissao/cartao-resultado-agente";
import { carregarExtrasAgente, type ExtrasAgente } from "@/lib/agente/painel";
import type { AgentePainel } from "@/lib/comissao/painel";
import { formatarMoeda } from "@/lib/format";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, Clock, Filter, MessagesSquare, ShoppingCart, UserX, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Meu painel (01/10/2026) — página inicial das agentes de venda. Mesmo cartão
 * do módulo Comissões, só com os números da própria agente. A gestão abre o
 * painel de qualquer agente por ?agente= para ver exatamente o que ela vê.
 */
export default async function MeuPainelPage({
  searchParams,
}: {
  searchParams: { mes?: string; agente?: string };
}) {
  const usuario = await exigirUsuario();
  const gestao = ["gestor", "direcao"].includes(usuario.perfil);
  const admin = criarClienteAdmin();

  const { data: comerciais } = gestao
    ? await admin
        .from("vendedores")
        .select("id, nome")
        .eq("ativo", true)
        .in("setor", ["comercial_interno", "comercial_externo", "corporativo"])
        .order("nome")
    : { data: [] };
  const vendedorId = gestao ? searchParams.agente ?? null : usuario.vendedor_id;

  const atual = primeiroDiaDoMes(hojeIso());
  const opcoes = [mesAtras(atual, 2), mesAtras(atual, 1), atual];
  const pedido = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "") ? `${searchParams.mes}-01` : null;

  const seletorGestao = gestao && (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <span className="text-muted-foreground">Ver o painel como a agente vê:</span>
      {(comerciais ?? []).map((v) => (
        <Link
          key={v.id}
          href={`/meu-painel?agente=${v.id}${pedido ? `&mes=${pedido.slice(0, 7)}` : ""}`}
          className={cn(
            "rounded-full border px-3 py-1",
            v.id === vendedorId ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
          )}
        >
          {v.nome}
        </Link>
      ))}
    </div>
  );

  if (!vendedorId) {
    return (
      <>
        <h1 className="mb-4 text-xl font-semibold tracking-tight lg:text-2xl">Meu painel</h1>
        {seletorGestao}
        {!gestao && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Seu usuário não está vinculado a um cadastro de agente. O vínculo é feito pelo
              Administrador em Administração → Usuários e perfis.
            </CardContent>
          </Card>
        )}
      </>
    );
  }

  // mês novo ainda sem meta cadastrada: mostra o anterior e avisa
  let mes = pedido ?? atual;
  let p = await carregarPainelComissoes(mes, { vendedorId });
  let semMetaNoMesAtual = false;
  if (!pedido && p.agentes.length === 0) {
    semMetaNoMesAtual = true;
    mes = mesAtras(atual, 1);
    p = await carregarPainelComissoes(mes, { vendedorId });
  }
  const a = p.agentes[0] ?? null;
  const [{ data: v }, linkSgp, x] = await Promise.all([
    admin.from("vendedores").select("nome").eq("id", vendedorId).maybeSingle(),
    templateLinkSgp(),
    carregarExtrasAgente(vendedorId, mes, a),
  ]);
  const primeiroNome = String(v?.nome ?? "").split(/\s+/)[0];
  const sufixoAgente = gestao ? `&agente=${vendedorId}` : "";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
            {gestao ? `Painel de ${v?.nome ?? "agente"}` : `Olá, ${primeiroNome}!`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sua meta, suas vendas e sua comissão — com a conta de cada número.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {opcoes.map((m) => (
            <Link
              key={m}
              href={`/meu-painel?mes=${m.slice(0, 7)}${sufixoAgente}`}
              className={cn(
                "rounded-full border px-3 py-1 text-sm capitalize",
                m === mes ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              {nomeMes(m)}
            </Link>
          ))}
        </div>
      </div>

      {seletorGestao}

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {p.fechamento ? (
          <span className="rounded-full bg-farol-verde/15 px-2.5 py-1 font-medium text-farol-verde">
            {nomeMes(mes)} fechado em {dataHora(p.fechamento.em)}
            {p.fechamento.pago ? " · pagamento registrado" : " · aguardando pagamento"}
          </span>
        ) : (
          <span className="rounded-full bg-farol-amarelo/20 px-2.5 py-1 font-medium text-yellow-700">
            {p.emAndamento ? "Mês em andamento — valores parciais, atualizados com o SGP" : "Ainda não fechado"}
          </span>
        )}
        {p.ultimaSync && <span className="px-1 py-1 text-muted-foreground">Dados do SGP de {dataHora(p.ultimaSync)}</span>}
      </div>

      {semMetaNoMesAtual && (
        <div className="mb-4 rounded-lg border border-farol-amarelo/50 bg-farol-amarelo/10 p-3 text-sm">
          A meta de {nomeMes(atual)} ainda não foi cadastrada pela gestão. Enquanto isso, aqui está o resultado de{" "}
          {nomeMes(mes)}.
        </div>
      )}

      {a ? (
        <CartaoResultadoAgente a={a} linkSgp={linkSgp} debito={p.debito} semConferencia />
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Sem meta ou regra de comissão cadastrada em {nomeMes(mes)}.
          </CardContent>
        </Card>
      )}

      <Indicadores a={a} x={x} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <EvolucaoDiaria x={x} mes={mes} />
        <FocoDoDia a={a} x={x} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <FunilCrm x={x} />
        <MixPlanos x={x} />
      </div>

      {a && (a.contratos.length > 0 || a.inadimplentes.length > 0) && (
        <div className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">
          <ConferenciaAgente a={a} linkSgp={linkSgp} className="border-t-0" />
        </div>
      )}

      <p className="mt-4 text-sm">
        <Link href="/minha-comissao" className="text-primary hover:underline">
          Simulador e demonstrativo da comissão →
        </Link>
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// blocos do painel
// ---------------------------------------------------------------------------
const num = (v: number) => v.toLocaleString("pt-BR");
const dec = (v: number) => v.toFixed(1).replace(".", ",");

function Bloco({ titulo, extra, children, className }: { titulo: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card p-5 shadow-sm", className)}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

const TONS = {
  azul: "bg-sky-500/10 text-sky-600",
  indigo: "bg-indigo-500/10 text-indigo-600",
  violeta: "bg-violet-500/10 text-violet-600",
  ambar: "bg-amber-500/15 text-amber-600",
  vermelho: "bg-farol-vermelho/10 text-farol-vermelho",
} as const;

function Kpi({
  icone,
  tom,
  rotulo,
  valor,
  rodape,
  href,
  alerta,
}: {
  icone: ReactNode;
  tom: keyof typeof TONS;
  rotulo: string;
  valor: string;
  rodape: ReactNode;
  href?: string;
  alerta?: boolean;
}) {
  const corpo = (
    <div
      className={cn(
        "flex h-full items-start gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors",
        href && "hover:border-primary/40",
        alerta && "border-farol-vermelho/40"
      )}
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONS[tom])}>{icone}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</p>
        <p className={cn("text-3xl font-bold leading-tight tabular-nums", alerta && "text-farol-vermelho")}>{valor}</p>
        <div className="text-xs text-muted-foreground">{rodape}</div>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {corpo}
    </Link>
  ) : (
    corpo
  );
}

function Indicadores({ a, x }: { a: AgentePainel | null; x: ExtrasAgente }) {
  const pend = a ? a.pendAssinatura + a.pendAtivacao : 0;
  const delta = x.vendasHoje.hoje - x.vendasHoje.anterior;
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Kpi
        icone={<MessagesSquare className="h-5 w-5" />}
        tom="azul"
        rotulo="Tickets em aberto no CRM"
        valor={num(x.crm.abertos)}
        href="/crm"
        rodape={
          x.crm.parados > 0 ? (
            <span className="font-medium text-amber-600">{x.crm.parados} parado{x.crm.parados > 1 ? "s" : ""} há mais de 48h</span>
          ) : (
            "nenhum parado há mais de 48h"
          )
        }
      />
      <Kpi
        icone={<ShoppingCart className="h-5 w-5" />}
        tom="indigo"
        rotulo="Vendas hoje"
        valor={num(x.vendasHoje.hoje)}
        rodape={
          <>
            {x.vendasHoje.diaAnterior && (
              <span className={cn("font-medium", delta > 0 ? "text-farol-verde" : delta < 0 ? "text-farol-vermelho" : "")}>
                {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {x.vendasHoje.anterior} no dia útil anterior
              </span>
            )}
            {x.vendasHoje.metaDia !== null && <span className="block">meta do dia: {dec(x.vendasHoje.metaDia)}</span>}
          </>
        }
      />
      <Kpi
        icone={<Filter className="h-5 w-5" />}
        tom="violeta"
        rotulo="Taxa de conversão CRM"
        valor={x.conversao === null ? "—" : `${Math.round(x.conversao)}%`}
        rodape={`${x.funil.assinados} assinados de ${x.funil.leads} tickets no mês`}
      />
      <Kpi
        icone={<Clock className="h-5 w-5" />}
        tom="ambar"
        rotulo="Pendências"
        valor={num(pend)}
        href="#conferir-contratos"
        rodape={a ? `${a.pendAssinatura} sem assinatura · ${a.pendAtivacao} com o operacional` : "—"}
      />
      <Kpi
        icone={<UserX className="h-5 w-5" />}
        tom="vermelho"
        rotulo="Reposição"
        valor={num(a?.reposicao ?? 0)}
        href="#conferir-inadimplentes"
        alerta={(a?.reposicao ?? 0) > 0}
        rodape="clientes inadimplentes a repor"
      />
    </div>
  );
}

function EvolucaoDiaria({ x, mes }: { x: ExtrasAgente; mes: string }) {
  const total = x.dias.reduce((s, d) => s + d.vendas, 0);
  const max = Math.max(1, ...x.dias.map((d) => d.vendas), (x.metaDiaMes ?? 0) * 1.4);
  return (
    <Bloco
      titulo="Evolução diária de vendas"
      extra={
        <span className="text-sm">
          <b className="text-primary">{num(total)}</b> <span className="text-muted-foreground">vendas em {nomeMes(mes)}</span>
        </span>
      }
    >
      <div className="relative h-44">
        {x.metaDiaMes !== null && (
          <div
            className="absolute inset-x-0 z-10 border-t-2 border-dashed border-farol-amarelo"
            style={{ bottom: `${(x.metaDiaMes / max) * 100}%` }}
            title={`Meta do dia: ${dec(x.metaDiaMes)}`}
          />
        )}
        <div className="flex h-full items-end gap-[3px] border-b">
          {x.dias.map((d) => (
            <div
              key={d.data}
              className={cn("flex h-full flex-1 flex-col items-center justify-end rounded-t-sm", !d.util && "bg-muted/50")}
              title={`${d.data.slice(8, 10)}/${d.data.slice(5, 7)}: ${d.vendas} venda${d.vendas === 1 ? "" : "s"}`}
            >
              {d.vendas > 0 && <span className="mb-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{d.vendas}</span>}
              <div
                className={cn("w-full rounded-t-sm", d.data === x.hoje ? "bg-primary" : "bg-sky-500/80")}
                style={{ height: `${(d.vendas / max) * 100}%`, minHeight: d.vendas > 0 ? 3 : 0 }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-[3px]">
        {x.dias.map((d, i) => (
          <span key={d.data} className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground">
            {i % 2 === 0 ? d.data.slice(8, 10) : ""}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500/80" /> vendas do dia</span>
        {x.metaDiaMes !== null && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-farol-amarelo" /> meta do dia ({dec(x.metaDiaMes)})
          </span>
        )}
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted" /> domingo e feriado</span>
      </div>
    </Bloco>
  );
}

function ItemFoco({ icone, titulo, texto, href, tom }: { icone: ReactNode; titulo: string; texto: string; href?: string; tom: string }) {
  const corpo = (
    <div className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", tom)}>{icone}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{titulo}</p>
        <p className="text-xs text-muted-foreground">{texto}</p>
      </div>
      {href && <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
    </div>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}

function FocoDoDia({ a, x }: { a: AgentePainel | null; x: ExtrasAgente }) {
  const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);
  const daAgente = [
    a && a.pendAssinatura > 0 && (
      <ItemFoco
        key="ass"
        icone={<AlertTriangle className="h-4 w-4" />}
        tom="bg-farol-vermelho/10 text-farol-vermelho"
        titulo={`${a.pendAssinatura} ${plural(a.pendAssinatura, "contrato sem assinatura", "contratos sem assinatura")}`}
        texto="Cobre o cliente: sem Termo de Adesão e Fidelidade a venda não comissiona."
        href="#conferir-contratos"
      />
    ),
    x.crm.parados > 0 && (
      <ItemFoco
        key="crm"
        icone={<MessagesSquare className="h-4 w-4" />}
        tom="bg-amber-500/15 text-amber-600"
        titulo={`${x.crm.parados} ${plural(x.crm.parados, "ticket parado", "tickets parados")} há mais de 48h`}
        texto="Retome o atendimento no CRM antes que o cliente esfrie."
        href="/crm"
      />
    ),
    a && a.reposicao > 0 && (
      <ItemFoco
        key="rep"
        icone={<UserX className="h-4 w-4" />}
        tom="bg-farol-vermelho/10 text-farol-vermelho"
        titulo={`${a.reposicao} ${plural(a.reposicao, "cliente na reposição", "clientes na reposição")}`}
        texto="Cliente que voltar a pagar até o fechamento sai da sua reposição."
        href="#conferir-inadimplentes"
      />
    ),
    a?.proximo && (
      <ItemFoco
        key="faixa"
        icone={<ArrowRight className="h-4 w-4" />}
        tom="bg-sky-500/10 text-sky-600"
        titulo={`${a.proximo.faltam === 1 ? "Falta 1 venda" : `Faltam ${a.proximo.faltam} vendas`} para ${a.proximo.degrau.atingimento_min}%`}
        texto={`Próxima faixa: ${a.proximo.degrau.tipo === "valor_por_venda" ? formatarMoeda(a.proximo.degrau.valor) + "/venda" : a.proximo.degrau.valor + "% do VTV"}.`}
      />
    ),
  ].filter(Boolean);

  return (
    <Bloco titulo="Foco do dia">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary">Depende de você</p>
      {daAgente.length > 0 ? (
        <div className="space-y-1">{daAgente}</div>
      ) : (
        <p className="p-2 text-sm text-farol-verde">Tudo em dia por aqui.</p>
      )}
      {a && a.pendAtivacao > 0 && (
        <>
          <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aguardando operacional</p>
          <ItemFoco
            icone={<Wrench className="h-4 w-4" />}
            tom="bg-muted text-muted-foreground"
            titulo={`${a.pendAtivacao} ${plural(a.pendAtivacao, "venda sem serviço ativo", "vendas sem serviço ativo")}`}
            texto="Instalação ou ativação com a equipe técnica — não depende de você."
          />
        </>
      )}
    </Bloco>
  );
}

function FunilCrm({ x }: { x: ExtrasAgente }) {
  const max = Math.max(1, x.funil.leads);
  const etapas = [
    { r: "Leads", v: x.funil.leads, c: "bg-sky-500" },
    { r: "Atendidos", v: x.funil.atendidos, c: "bg-indigo-500" },
    { r: "Contrato assinado", v: x.funil.assinados, c: "bg-emerald-500" },
  ];
  return (
    <Bloco titulo="Funil do CRM no mês">
      <div className="space-y-3">
        {etapas.map((e) => (
          <div key={e.r} className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-sm text-muted-foreground">{e.r}</span>
            <div className="h-7 flex-1 rounded-md bg-muted/60">
              <div className={cn("flex h-full items-center rounded-md", e.c)} style={{ width: `${Math.max(e.v > 0 ? 6 : 0, (e.v / max) * 100)}%` }} />
            </div>
            <span className="w-10 text-right text-lg font-bold tabular-nums">{num(e.v)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg border border-farol-verde/30 bg-farol-verde/10 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-farol-verde">Taxa de conversão</span>
        <span className="text-2xl font-bold tabular-nums text-farol-verde">
          {x.conversao === null ? "—" : `${Math.round(x.conversao)}%`}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {x.funil.naoConvertidos} não convertido{x.funil.naoConvertidos === 1 ? "" : "s"} no mês
        {x.funil.semTicket > 0 && <> · {x.funil.semTicket} venda{x.funil.semTicket === 1 ? "" : "s"} feita{x.funil.semTicket === 1 ? "" : "s"} direto no SGP, sem conversa no CRM</>}
      </p>
    </Bloco>
  );
}

function MixPlanos({ x }: { x: ExtrasAgente }) {
  const total = x.mix.reduce((s, m) => s + m.quantidade, 0);
  const cores = ["bg-sky-500", "bg-indigo-500", "bg-violet-500", "bg-emerald-500", "bg-slate-400"];
  return (
    <Bloco
      titulo="Mix por plano"
      extra={
        <span className="text-sm text-muted-foreground">
          ticket médio <b className="text-foreground">{formatarMoeda(x.ticketMedio)}</b>
        </span>
      }
    >
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">Sem vendas válidas no mês.</p>
      ) : (
        <div className="space-y-3">
          {x.mix.map((m, i) => (
            <div key={m.plano} className="flex items-center gap-3">
              <span className="w-36 shrink-0 truncate text-sm" title={m.plano}>{m.plano}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted/60">
                <div className={cn("h-full rounded-full", cores[i % cores.length])} style={{ width: `${(m.quantidade / total) * 100}%` }} />
              </div>
              <span className="w-8 text-right text-sm font-bold tabular-nums">{m.quantidade}</span>
              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{Math.round((m.quantidade / total) * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </Bloco>
  );
}
