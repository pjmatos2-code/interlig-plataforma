import Link from "next/link";
import {
  AlarmClock, CalendarClock, CheckCircle2, ChevronRight, ClipboardList, Flame, HandCoins, Hourglass,
  PartyPopper, RotateCcw, Target, UserRoundPlus,
} from "lucide-react";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarMeuDia, vendedorDoMeuDia, type CardTicket } from "@/lib/meu-dia/dados";
import { ROTULO_PENDENCIA, ROTULO_SUBFILA, type SubFila } from "@/lib/meu-dia/regras";
import { cn } from "@/lib/utils";
import { AtualizarSozinho, CartaoPosVenda } from "./posvenda";
import { CopiarMensagemGoogle, IconeGoogle } from "./lembrete-google";

export const dynamic = "force-dynamic";

const TZ = { timeZone: "America/Santarem" } as const;
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { ...TZ, hour: "2-digit", minute: "2-digit" });
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { ...TZ, day: "2-digit", month: "2-digit" });
function haQuanto(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${String(min % 60).padStart(2, "0")}min`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? "s" : ""}${h % 24 ? ` ${h % 24}h` : ""}`;
}

const ICONE_SUBFILA: Record<SubFila, React.ReactNode> = {
  atrasado: <AlarmClock className="h-4 w-4 text-farol-vermelho" />,
  hoje: <CalendarClock className="h-4 w-4 text-interlig-azul" />,
  urgencia: <Flame className="h-4 w-4 text-orange-500" />,
  parada: <Hourglass className="h-4 w-4 text-amber-600" />,
};

/**
 * Meu Dia — Comercial Interno (14/10/2026). Missões automáticas somem sozinhas
 * quando o CRM/SGP registra o que foi feito; só o pós-venda é marcado à mão.
 */
export default async function MeuDiaPage({ searchParams }: { searchParams: { vendedor?: string } }) {
  const usuario = await exigirUsuario();
  let vendedor: { id: string; nome: string } | null = null;
  if (usuario.perfil === "gestor" && searchParams.vendedor) {
    const { data } = await criarClienteAdmin().from("vendedores").select("id, nome").eq("id", searchParams.vendedor).eq("meu_dia", true).maybeSingle();
    vendedor = (data as { id: string; nome: string } | null) ?? null;
  } else {
    vendedor = await vendedorDoMeuDia(usuario.id);
  }
  if (!vendedor) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Meu Dia</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {usuario.perfil === "gestor" ? (
            <>Abra pela <Link href="/meu-dia/equipe" className="font-medium text-interlig-azul underline">visão da equipe</Link> para ver o dia de cada vendedora.</>
          ) : (
            "O Meu Dia ainda não está ativo para o seu setor."
          )}
        </p>
      </div>
    );
  }

  const d = await carregarMeuDia(vendedor.id);
  const totalFollowup = Object.values(d.followup).reduce((s, l) => s + l.length, 0);
  const pct = d.abertos + d.concluidosHoje > 0 ? Math.round((d.concluidosHoje / (d.abertos + d.concluidosHoje)) * 100) : 100;
  const primeiroNome = d.nome.split(" ")[0];
  const horaAgora = Number(new Date().toLocaleString("en-US", { ...TZ, hour: "numeric", hour12: false }));
  const saudacao = horaAgora < 12 ? "Bom dia" : horaAgora < 18 ? "Boa tarde" : "Boa noite";
  const hojeExtenso = new Date(`${d.hoje}T12:00:00Z`)
    .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="space-y-4">
      <AtualizarSozinho />
      {/* cabeçalho do dia */}
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="bg-gradient-to-r from-interlig-marinho to-interlig-azul px-5 py-5 text-white sm:px-6">
          <p className="text-sm text-white/70">{hojeExtenso}</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {saudacao}, {primeiroNome}!
          </h1>
          <p className="mt-1 text-sm text-white/80">
            {d.abertos === 0 ? "Tudo em dia por aqui. 🎉" : `${d.abertos} ${d.abertos === 1 ? "missão aberta" : "missões abertas"} — elas somem sozinhas quando você resolve no CRM.`}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/20">
              <span className="block h-full rounded-full bg-farol-verde" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-sm font-semibold tabular-nums">{d.concluidosHoje} feitas hoje · {pct}%</span>
          </div>
        </div>
        <nav className="grid grid-cols-3 gap-px border-t bg-border text-center sm:grid-cols-6">
          {[
            ["#leads", "Leads", d.leads.length],
            ["#followup", "Follow-up", totalFollowup],
            ["#esteira", "Esteira", d.esteira.length],
            ["#posvenda", "Pós-venda", d.posvenda.length],
            ["#pendentes", "A repor", d.pendentes90.total],
            ["#meta", "Meta hoje", d.meta.batida ? "✓" : d.meta.metaDia],
          ].map(([href, rot, n]) => (
            <a key={String(href)} href={String(href)} className="bg-card px-2 py-2.5 hover:bg-muted/50">
              <span className={cn("block text-lg font-bold tabular-nums", Number(n) > 0 && href !== "#meta" && href !== "#pendentes" ? "text-interlig-azul" : "text-foreground")}>{n}</span>
              <span className="block text-[11px] text-muted-foreground">{rot}</span>
            </a>
          ))}
        </nav>
      </section>

      {/* 1 — Leads aguardando */}
      <Bloco id="leads" numero={1} titulo="Leads aguardando" icone={<UserRoundPlus className="h-5 w-5" />} total={d.leads.length} vazio="Nenhum lead esperando o primeiro contato.">
        <ul className="space-y-2">
          {d.leads.map((l) => (
            <CartaoTicket key={l.id} t={l} direita={<Tempo cor="text-farol-vermelho">aguardando há {haQuanto(l.referencia ?? l.criadoEm)}</Tempo>} />
          ))}
        </ul>
      </Bloco>

      {/* 2 — Follow-up */}
      <Bloco id="followup" numero={2} titulo="Follow-up" icone={<RotateCcw className="h-5 w-5" />} total={totalFollowup} vazio="Nenhum retorno pendente.">
        <div className="space-y-4">
          {(Object.keys(d.followup) as SubFila[])
            .filter((k) => d.followup[k].length > 0)
            .map((k) => (
              <div key={k}>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  {ICONE_SUBFILA[k]} {ROTULO_SUBFILA[k]}
                  <span className="rounded-full bg-muted px-2 text-xs font-medium tabular-nums">{d.followup[k].length}</span>
                </p>
                <ul className="space-y-2">
                  {d.followup[k].map((t) => (
                    <CartaoTicket
                      key={t.id}
                      t={t}
                      extra={k === "urgencia" ? t.proximaAbordagem : null}
                      direita={
                        k === "atrasado" && t.referencia ? (
                          <Tempo cor="text-farol-vermelho">era para {dataCurta(t.referencia)} {hora(t.referencia)}</Tempo>
                        ) : k === "hoje" && t.referencia ? (
                          <Tempo cor="text-interlig-azul">hoje às {hora(t.referencia)}</Tempo>
                        ) : k === "parada" && t.referencia ? (
                          <Tempo cor="text-amber-700">parada há {haQuanto(t.referencia)}</Tempo>
                        ) : (
                          <Tempo cor="text-orange-600">sugerido pela IA</Tempo>
                        )
                      }
                    />
                  ))}
                </ul>
              </div>
            ))}
          {totalFollowup > 0 && (
            <p className="text-xs text-muted-foreground">
              Abra o ticket e registre a tratativa com o desfecho (Vendido, Perdido ou Reagendado) — o card sai daqui na hora.
            </p>
          )}
        </div>
      </Bloco>

      {/* 3 — Esteira */}
      <Bloco id="esteira" numero={3} titulo="Esteira do contrato" icone={<ClipboardList className="h-5 w-5" />} total={d.esteira.length} vazio="Nenhuma venda travada.">
        <ul className="space-y-2">
          {d.esteira.map((e) => {
            const conteudo = (
              <>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{e.cliente}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {e.pendencias.map((p) => (
                      <span key={p} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                        {ROTULO_PENDENCIA[p]}
                      </span>
                    ))}
                  </div>
                  {e.detalhe && <p className="mt-1 text-xs text-muted-foreground">{e.detalhe}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{e.contratoSgp ? `Contrato ${e.contratoSgp}` : ""}</span>
              </>
            );
            return e.ticketId ? (
              <li key={e.chave}>
                <Link href={`/crm/${e.ticketId}`} className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3 hover:border-interlig-azul/40 hover:bg-sky-50/40">
                  {conteudo}
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ) : (
              <li key={e.chave} className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
                {conteudo}
              </li>
            );
          })}
        </ul>
      </Bloco>

      {/* 4 — Pós-venda (manual) */}
      <Bloco id="posvenda" numero={4} titulo="Pós-venda" icone={<HandCoins className="h-5 w-5" />} total={d.posvenda.length} vazio="Nenhum cliente ativado ontem esperando boas-vindas." nota="Clientes instalados ontem: mande as boas-vindas pelo SZ e pergunte por uma indicação.">
        <ul className="space-y-2">
          {d.posvenda.map((p) => (
            <CartaoPosVenda key={p.contratoId} item={p} />
          ))}
        </ul>
      </Bloco>

      {/* 5 — Pendentes 90+ */}
      <Bloco id="pendentes" numero={5} titulo="Pendentes 90+" icone={<Hourglass className="h-5 w-5" />} total={null} vazio="">
        <p className="text-sm">
          <span className="text-3xl font-bold tabular-nums text-farol-vermelho">A repor: {d.pendentes90.total}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Vendas suas dos últimos 90 dias que chegaram a ser instaladas e hoje estão suspensas ou canceladas. Indicador separado — não desconta da meta.
        </p>
        {d.pendentes90.total > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-interlig-azul">Ver a lista</summary>
            <ul className="mt-2 divide-y rounded-lg border text-sm">
              {d.pendentes90.lista.map((i) => (
                <li key={i.sgp + i.dataVenda} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate">{i.cliente}</span>
                  <span className="text-xs text-muted-foreground">
                    contrato {i.sgp} · vendido {i.dataVenda.split("-").reverse().join("/")} ·{" "}
                    <span className={i.status === "cancelado" ? "font-medium text-farol-vermelho" : "font-medium text-amber-700"}>{i.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Bloco>

      {/* 6 — Meta */}
      <Bloco id="meta" numero={6} titulo="Meta" icone={<Target className="h-5 w-5" />} total={null} vazio="">
        {d.meta.metaMes === 0 ? (
          <p className="text-sm text-muted-foreground">Sem meta cadastrada para este mês.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-4">
            <Numero rotulo="Vendas hoje" valor={String(d.meta.realizadoHoje)} destaque={!d.meta.batida && d.meta.realizadoHoje >= d.meta.metaDia ? "verde" : undefined} />
            <Numero
              rotulo="Meta do dia"
              valor={d.meta.batida ? "Meta batida" : String(d.meta.metaDia)}
              detalhe={d.meta.batida ? "🎉 parabéns!" : `faltam ${d.meta.falta} em ${d.meta.diasRestantes} dia${d.meta.diasRestantes === 1 ? "" : "s"} úteis`}
              destaque={d.meta.batida ? "verde" : "azul"}
            />
            <Numero rotulo="No mês" valor={`${d.meta.realizadoMes} / ${d.meta.metaMes}`} />
            <div className="rounded-lg border p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Atingido</p>
              <p className="text-2xl font-bold tabular-nums">{d.meta.pct}%</p>
              <span className="mt-1 block h-2 overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full rounded-full", d.meta.pct >= 100 ? "bg-farol-verde" : "bg-interlig-ceu")} style={{ width: `${Math.min(100, d.meta.pct)}%` }} />
              </span>
            </div>
          </div>
        )}
        {d.meta.batida && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-farol-verde/15 px-3 py-1 text-sm font-medium text-farol-verde">
            <PartyPopper className="h-4 w-4" /> Meta do mês batida!
          </p>
        )}
      </Bloco>

      {/* 7 — Lembrete: avaliação no Google (sem regra nem controle) */}
      <Bloco id="google" numero={7} titulo="Avaliação no Google" icone={<IconeGoogle />} total={null} vazio="">
        <p className="text-sm">
          Em todo atendimento, capriche e, ao final, <strong>convide o cliente a avaliar a Interlig no Google</strong> — mande o link pelo SZ Chat.
        </p>
        <CopiarMensagemGoogle agente={primeiroNome} />
      </Bloco>
    </div>
  );
}

function Bloco({
  id,
  numero,
  titulo,
  icone,
  total,
  vazio,
  nota,
  children,
}: {
  id: string;
  numero: number;
  titulo: string;
  icone: React.ReactNode;
  total: number | null;
  vazio: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-interlig-azul/10 text-xs font-bold text-interlig-azul">{numero}</span>
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-base font-semibold sm:text-lg">
          <span className="text-interlig-azul">{icone}</span>
          {titulo}
        </h2>
        {total !== null && (
          <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums", total > 0 ? "bg-interlig-azul text-white" : "bg-farol-verde/15 text-farol-verde")}>
            {total > 0 ? total : <CheckCircle2 className="h-4 w-4" />}
          </span>
        )}
      </div>
      {nota && total !== 0 && <p className="mb-3 text-xs text-muted-foreground">{nota}</p>}
      {total === 0 ? <p className="text-sm text-muted-foreground">{vazio}</p> : children}
    </section>
  );
}

function Tempo({ cor, children }: { cor: string; children: React.ReactNode }) {
  return <span className={cn("shrink-0 text-xs font-medium sm:text-right", cor)}>{children}</span>;
}

function CartaoTicket({ t, direita, extra }: { t: CardTicket; direita: React.ReactNode; extra?: string | null }) {
  return (
    <li>
      <Link href={`/crm/${t.id}`} className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 hover:border-interlig-azul/40 hover:bg-sky-50/40 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{t.cliente}</p>
          <p className="text-xs text-muted-foreground">
            {t.origem}
            {t.telefone ? ` · ${t.telefone}` : ""}
          </p>
          {extra && <p className="mt-1 line-clamp-2 text-xs text-foreground/80">➜ {extra}</p>}
        </div>
        <div className="flex items-center justify-between gap-1.5 sm:justify-end">
          {direita}
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </Link>
    </li>
  );
}

function Numero({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe?: string; destaque?: "verde" | "azul" }) {
  return (
    <div className={cn("rounded-lg border p-3", destaque === "verde" && "border-farol-verde/40 bg-farol-verde/5", destaque === "azul" && "border-interlig-azul/30 bg-sky-50/60")}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={cn("text-2xl font-bold tabular-nums", destaque === "verde" && "text-farol-verde", destaque === "azul" && "text-interlig-azul")}>{valor}</p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}
