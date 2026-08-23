import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { resolverPeriodo } from "@/lib/datas";
import { carregarCrm, type CartaoTicket, type FiltrosCrm } from "@/lib/crm/dados";
import { executarRotinasCrm } from "@/lib/crm/rotinas";
import { FecharODia } from "@/components/crm/fechar-o-dia";
import { criarClienteServidor } from "@/lib/supabase/server";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { buttonVariants } from "@/components/ui/button";
import { formatarMoeda, formatarMoedaKpi, formatarNumero, formatarPercentual } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type EtapaTicket } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const COLUNAS_TRILHA: EtapaTicket[] = ["novo", "em_atendimento", "proposta", "aguardando", "fechado"];
const LIMITE_COLUNA = 15;

/** paleta leve por coluna (liquid glass) */
const TOM_COLUNA: Record<string, { texto: string; fundo: string; borda: string }> = {
  novo: { texto: "text-slate-600", fundo: "from-slate-100/80", borda: "border-slate-200/70" },
  em_atendimento: { texto: "text-sky-700", fundo: "from-sky-100/80", borda: "border-sky-200/70" },
  proposta: { texto: "text-violet-700", fundo: "from-violet-100/80", borda: "border-violet-200/70" },
  aguardando: { texto: "text-amber-700", fundo: "from-amber-100/80", borda: "border-amber-200/70" },
  fechado: { texto: "text-emerald-700", fundo: "from-emerald-100/80", borda: "border-emerald-200/70" },
};

/** classe base dos painéis de vidro */
const vidro =
  "rounded-2xl border border-white/60 bg-white/55 shadow-sm shadow-slate-200/50 backdrop-blur-xl";

function acaoSugerida(t: CartaoTicket, hoje: string): string {
  if (t.followup_em) {
    const dia = t.followup_em.slice(0, 10);
    if (dia < hoje) return "Ligar hoje";
    if (dia === hoje) return `Retornar às ${t.followup_em.slice(11, 16)}`;
    return `Retorno ${t.followup_em.slice(8, 10)}/${t.followup_em.slice(5, 7)}`;
  }
  if (t.etapa === "proposta") return "Enviar proposta";
  if (t.etapa === "aguardando") return "Criar contrato";
  return "Ligar hoje";
}

function Prioridade({ t }: { t: CartaoTicket }) {
  const p =
    t.aviso === "fechar"
      ? { rotulo: "Alta", cor: "bg-rose-100 text-rose-700" }
      : t.aviso === "avisar"
        ? { rotulo: "Média", cor: "bg-amber-100 text-amber-700" }
        : { rotulo: "Baixa", cor: "bg-emerald-100 text-emerald-700" };
  return (
    <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", p.cor)}>{p.rotulo}</span>
  );
}

function CartaoVendida({ t, linkTemplate }: { t: CartaoTicket; linkTemplate: string }) {
  const link = aplicarLinkSgp(linkTemplate, {
    clienteId: t.sgpClienteId,
    contratoId: t.sgpContratoId,
    cpf: t.cpf,
  });
  return (
    <div className="rounded-xl border border-emerald-200/70 bg-white/80 p-3 text-sm shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/crm/${t.id}`}
          className="min-w-0 truncate font-semibold text-slate-800 hover:text-primary hover:underline"
        >
          {t.cliente_nome}
        </Link>
        {t.valor != null && t.valor > 0 && (
          <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-700">
            {formatarMoeda(t.valor)}
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate text-xs text-slate-500">{t.plano ?? "—"}</p>
      <p className="mt-1 truncate text-[11px] text-slate-400">{t.vendedora ?? "Sem vendedora"}</p>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-emerald-100 pt-2">
        <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
          ● Vendida
        </span>
        {t.sgpContratoId && link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir contrato no SGP"
            className="rounded-md bg-interlig-ceu/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-interlig-ceu hover:underline"
          >
            #{t.sgpContratoId} ↗
          </a>
        ) : (
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
            aguardando SGP
          </span>
        )}
      </div>
    </div>
  );
}

function CartaoGlass({ t, hoje }: { t: CartaoTicket; hoje: string }) {
  const perdida = t.etapa === "fechado" && t.desfecho === "nao_convertido";
  const iniciais = (t.vendedora ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <Link
      href={`/crm/${t.id}`}
      className={cn(
        "block rounded-xl border border-white/70 bg-white/75 p-3 text-sm shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-md",
        perdida && "opacity-75"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate font-semibold text-slate-800">{t.cliente_nome}</p>
        {t.valor != null && t.valor > 0 && (
          <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
            {formatarMoeda(t.valor)}
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate text-xs text-slate-500">{t.plano ?? "Plano a definir"}</p>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-interlig-ceu/30 to-interlig-azul/30 text-[9px] font-bold text-interlig-azul">
          {iniciais}
        </span>
        <span className="truncate">{t.vendedora ?? "Sem vendedora"}</span>
      </div>
      <p className="mt-1 truncate text-[11px] text-slate-400">
        {t.pop ?? "—"} · {t.origem_criacao === "sz_auto" ? "WhatsApp" : "Manual"}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
        <span className="text-[11px] text-slate-400">
          ⏱ {t.diasNaEtapa === 0 ? "hoje" : `há ${t.diasNaEtapa}d`}
        </span>
        {perdida ? (
          <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
            ● Perdida
          </span>
        ) : (
          <>
            <span className="truncate text-[11px] font-medium text-interlig-ceu">
              ☎ {acaoSugerida(t, hoje)}
            </span>
            <Prioridade t={t} />
          </>
        )}
      </div>
    </Link>
  );
}

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const usuario = await exigirUsuario();
  const periodo = resolverPeriodo(searchParams);
  await executarRotinasCrm();

  const filtros: FiltrosCrm = {
    busca: searchParams.q || undefined,
    popId: searchParams.pop || null,
    vendedorId: searchParams.vend || null,
    origem: (searchParams.origem as FiltrosCrm["origem"]) || null,
    meus: searchParams.meus === "1",
    semVendedor: searchParams.sem_vendedor === "1",
    semContato24h: searchParams.sem_contato === "1",
    emRisco: searchParams.risco === "1",
    altoValor: searchParams.alto_valor === "1",
  };
  const d = await carregarCrm(periodo, usuario, filtros);
  const hoje = new Date().toISOString().slice(0, 10);
  const ehVendedora = usuario.perfil === "vendedora";

  const supabase = criarClienteServidor();
  const [{ data: pops }, { data: vendedoras }, linkTemplate] = await Promise.all([
    supabase.from("pops").select("id, nome").order("nome"),
    supabase.from("vendedores").select("id, nome").eq("ativo", true).order("nome"),
    templateLinkSgp(),
  ]);

  // helpers de URL preservando filtros
  const baseQs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (v) baseQs.set(k, v);
  const comChip = (chave: string) => {
    const qs = new URLSearchParams(baseQs);
    if (qs.get(chave) === "1") qs.delete(chave);
    else qs.set(chave, "1");
    return `/crm?${qs.toString()}`;
  };
  const chipAtivo = (chave: string) => searchParams[chave] === "1";
  const comPeriodo = (p: string) => {
    const qs = new URLSearchParams(baseQs);
    qs.delete("de");
    qs.delete("ate");
    qs.set("periodo", p);
    return `/crm?${qs.toString()}`;
  };
  const periodoAtivo = searchParams.periodo ?? "mes";

  const chips: { chave: string; rotulo: string }[] = [
    ...(usuario.vendedor_id ? [{ chave: "meus", rotulo: "👤 Meus tickets" }] : []),
    { chave: "sem_vendedor", rotulo: "👥 Sem responsável" },
    { chave: "sem_contato", rotulo: "🕐 Sem contato há 24h" },
    { chave: "risco", rotulo: "⚠️ Em risco" },
    { chave: "alto_valor", rotulo: "💲 Alto valor" },
  ];

  const t1a = d.kpis.primeiraTratativaMin;
  const t1aRotulo =
    t1a === null
      ? "—"
      : t1a >= 60 * 24
        ? `${Math.floor(t1a / (60 * 24))}d ${Math.floor((t1a % (60 * 24)) / 60)}h`
        : t1a >= 60
          ? `${Math.floor(t1a / 60)}h ${Math.round(t1a % 60)}min`
          : `${Math.round(t1a)}min`;

  return (
    <div
      className="-m-4 min-h-screen p-4 lg:-m-6 lg:p-6"
      style={{
        background:
          "linear-gradient(135deg, #eef4ff 0%, #f6f8ff 30%, #f2f0ff 60%, #eefaff 100%)",
      }}
    >
      {/* cabeçalho */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">CRM comercial</h1>
          <p className="text-sm text-slate-500">
            Visão operacional dos tickets, funil e oportunidades em tempo real
          </p>
        </div>
        <Link
          href="/crm/novo"
          className={cn(buttonVariants({}), "shadow-lg shadow-interlig-azul/20")}
        >
          + Novo ticket
        </Link>
      </div>

      {/* busca + filtros */}
      <form method="get" className={cn(vidro, "mb-3 flex flex-wrap items-center gap-2 p-2.5")}>
        {searchParams.periodo && (
          <input type="hidden" name="periodo" value={searchParams.periodo} />
        )}
        <div className="flex min-w-56 flex-1 items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-3 py-2">
          <span className="text-slate-400">🔎</span>
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Buscar cliente ou telefone"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
        <select
          name="pop"
          defaultValue={searchParams.pop ?? ""}
          className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm"
        >
          <option value="">Cidade</option>
          {(pops ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        {!ehVendedora && (
          <select
            name="vend"
            defaultValue={searchParams.vend ?? ""}
            className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm"
          >
            <option value="">Vendedora</option>
            {(vendedoras ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        )}
        <select
          name="origem"
          defaultValue={searchParams.origem ?? ""}
          className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm"
        >
          <option value="">Origem</option>
          <option value="sz_auto">WhatsApp</option>
          <option value="manual">Manual</option>
        </select>
        <button
          type="submit"
          className="rounded-xl bg-interlig-azul px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Filtrar
        </button>
      </form>

      {/* período + chips + reconciliação */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className={cn(vidro, "flex p-1 text-sm font-medium")}>
          {[
            { p: "hoje", r: "Hoje" },
            { p: "semana", r: "Semana" },
            { p: "mes", r: "Mês" },
          ].map(({ p, r }) => (
            <Link
              key={p}
              href={comPeriodo(p)}
              className={cn(
                "rounded-xl px-3.5 py-1.5",
                periodoAtivo === p
                  ? "bg-interlig-azul text-white shadow"
                  : "text-slate-600 hover:bg-white/70"
              )}
            >
              {r}
            </Link>
          ))}
        </div>
        {chips.map((c) => (
          <Link
            key={c.chave}
            href={comChip(c.chave)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors",
              chipAtivo(c.chave)
                ? "border-interlig-azul bg-interlig-azul text-white shadow"
                : "border-white/70 bg-white/55 text-slate-600 hover:bg-white/80"
            )}
          >
            {c.rotulo}
          </Link>
        ))}
        <span className="ml-auto rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-700 backdrop-blur">
          ✓ Reconciliação com SGP{" "}
          {d.kpis.reconciliacao.taxa === null
            ? "—"
            : formatarPercentual(d.kpis.reconciliacao.taxa, 0)}
        </span>
      </div>

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div
          className={cn(
            vidro,
            "border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 to-white/50 p-4"
          )}
        >
          <p className="text-xs font-semibold text-emerald-700">Conversão real 📈</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
            {d.kpis.conversao.taxa === null ? "—" : formatarPercentual(d.kpis.conversao.taxa, 0)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {d.kpis.conversaoDeltaPp === null ? (
              `${d.kpis.conversao.convertidos} de ${d.kpis.conversao.fechados} fechados`
            ) : (
              <span
                className={d.kpis.conversaoDeltaPp >= 0 ? "text-emerald-600" : "text-rose-600"}
              >
                {d.kpis.conversaoDeltaPp >= 0 ? "▲ +" : "▼ "}
                {d.kpis.conversaoDeltaPp.toFixed(1).replace(".", ",")} p.p. vs período anterior
              </span>
            )}
          </p>
        </div>
        <div
          className={cn(vidro, "border-sky-200/60 bg-gradient-to-br from-sky-50/80 to-white/50 p-4")}
        >
          <p className="text-xs font-semibold text-sky-700">Pipeline em aberto 📊</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
            {formatarMoedaKpi(d.kpis.pipeline.valor)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {d.kpis.pipeline.quantidade} oportunidade{d.kpis.pipeline.quantidade === 1 ? "" : "s"}{" "}
            ativa{d.kpis.pipeline.quantidade === 1 ? "" : "s"}
          </p>
        </div>
        <div
          className={cn(
            vidro,
            "border-amber-200/60 bg-gradient-to-br from-amber-50/80 to-white/50 p-4"
          )}
        >
          <p className="text-xs font-semibold text-amber-700">Tickets em risco ⚠️</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
            {d.kpis.emRisco.total}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {d.kpis.emRisco.semVendedor} sem vendedora · {d.kpis.emRisco.semContato24h} sem contato
          </p>
        </div>
        <div
          className={cn(vidro, "border-rose-200/60 bg-gradient-to-br from-rose-50/80 to-white/50 p-4")}
        >
          <p className="text-xs font-semibold text-rose-700">1ª tratativa ⏰</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{t1aRotulo}</p>
          <p className="mt-0.5 text-xs text-slate-500">meta: responder em até 2h</p>
        </div>
      </div>

      {/* funil */}
      <div className={cn(vidro, "mb-4 overflow-x-auto p-2")}>
        <div className="flex min-w-[640px] items-stretch">
          {d.funilEtapas.map((f, i) => (
            <div key={f.etapa} className="flex flex-1 items-center">
              <div
                className={cn(
                  "flex-1 rounded-xl bg-gradient-to-b to-white/40 px-3 py-2 text-center",
                  TOM_COLUNA[f.etapa].fundo
                )}
              >
                <p className={cn("truncate text-xs font-bold", TOM_COLUNA[f.etapa].texto)}>
                  {f.rotulo}
                </p>
                <p className="text-xl font-bold tabular-nums text-slate-900">{f.quantidade}</p>
                <p className="text-[11px] tabular-nums text-slate-500">{formatarMoeda(f.valor)}</p>
              </div>
              {i < d.funilEtapas.length - 1 && (
                <span className="shrink-0 px-1.5 text-xs font-bold tabular-nums text-slate-400">
                  {f.conversaoPct === null ? "—" : `${f.conversaoPct}%`} →
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* corpo: kanban + trilho lateral */}
      <div className="">
        <div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {COLUNAS_TRILHA.map((etapa) => {
              const itens = d.colunas[etapa];
              const total = itens.reduce((s, t) => s + (t.valor ?? 0), 0);
              const tom = TOM_COLUNA[etapa];
              return (
                <div key={etapa} className={cn(vidro, "flex min-w-0 flex-col", tom.borda)}>
                  <div
                    className={cn(
                      "rounded-t-2xl bg-gradient-to-b to-transparent px-3 py-2.5",
                      tom.fundo
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p className={cn("truncate text-sm font-bold", tom.texto)}>
                        {d.funilEtapas.find((f) => f.etapa === etapa)?.rotulo}
                      </p>
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-600">
                        {itens.length}
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold tabular-nums text-slate-500">
                      {formatarMoeda(total)}
                    </p>
                  </div>
                  <div
                    className="flex flex-col gap-2 overflow-y-auto p-2"
                    style={{ maxHeight: "30rem" }}
                  >
                    {itens.slice(0, LIMITE_COLUNA).map((t) =>
                      etapa === "fechado" && t.desfecho === "convertido" ? (
                        <CartaoVendida key={t.id} t={t} linkTemplate={linkTemplate} />
                      ) : (
                        <CartaoGlass key={t.id} t={t} hoje={hoje} />
                      )
                    )}
                    {itens.length === 0 && (
                      <div className="flex flex-col items-center gap-1 py-8 text-center text-slate-400">
                        <span className="text-2xl">📝</span>
                        <p className="text-xs">Nenhum ticket nesta etapa</p>
                      </div>
                    )}
                    {itens.length > LIMITE_COLUNA && (
                      <p className="py-1 text-center text-[11px] text-slate-400">
                        … e mais {itens.length - LIMITE_COLUNA}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* caixas de apoio — abaixo do kanban para ele aparecer inteiro */}
        <div className="mt-4 grid items-start gap-3 md:grid-cols-3">
          <div className={cn(vidro, "p-4")}>
            <p className="mb-2 text-sm font-bold text-slate-800">Atenção necessária</p>
            <ul className="space-y-1.5 text-sm">
              <li>
                <Link
                  href={comChip("sem_contato")}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/70"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-xs">
                    🔴
                  </span>
                  <span className="flex-1 text-slate-700">
                    {d.atencao.semContato48h} sem contato há 48h+
                  </span>
                  <span className="text-slate-400">›</span>
                </Link>
              </li>
              <li>
                <span className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-xs">
                    🟠
                  </span>
                  <span className="flex-1 text-slate-700">
                    {d.atencao.retornosVencidos} retorno
                    {d.atencao.retornosVencidos === 1 ? "" : "s"} vencido
                    {d.atencao.retornosVencidos === 1 ? "" : "s"}
                  </span>
                </span>
              </li>
              <li>
                <Link
                  href={comChip("sem_vendedor")}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/70"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs">
                    🟡
                  </span>
                  <span className="flex-1 text-slate-700">
                    {d.atencao.semVendedor} sem vendedora
                  </span>
                  <span className="text-slate-400">›</span>
                </Link>
              </li>
              <li>
                <span className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs">
                    💰
                  </span>
                  <span className="flex-1 text-slate-700">
                    {d.atencao.fechadasHoje} venda{d.atencao.fechadasHoje === 1 ? "" : "s"} fechada
                    {d.atencao.fechadasHoje === 1 ? "" : "s"} hoje
                  </span>
                </span>
              </li>
            </ul>
          </div>

          <div className={cn(vidro, "p-4")}>
            <p className="mb-2 flex items-center justify-between text-sm font-bold text-slate-800">
              Fechar o dia · retornos <span className="text-base">📅</span>
            </p>
            <FecharODia retornosHoje={d.retornosHoje} retornosVencidos={d.retornosVencidos} />
          </div>

          <div className={cn(vidro, "p-4")}>
            <p className="mb-1 text-sm font-bold text-slate-800">📈 Fechados no mês</p>
            <p className="text-lg font-bold text-slate-900">
              {formatarNumero(d.fechadosMes.quantidade)} vendas{" "}
              <span className="text-emerald-600">{formatarMoedaKpi(d.fechadosMes.valor)}</span>
            </p>
            {d.fechadosMes.ultimas.length > 0 && (
              <>
                <p className="mb-1 mt-2 text-[11px] font-semibold uppercase text-slate-400">
                  Últimas vendas
                </p>
                <ul className="space-y-1 text-sm">
                  {d.fechadosMes.ultimas.map((u) => (
                    <li key={u.id} className="flex items-center justify-between">
                      <Link href={`/crm/${u.id}`} className="truncate text-slate-700 hover:underline">
                        {u.cliente}
                      </Link>
                      <span className="tabular-nums text-slate-500">
                        {formatarMoeda(u.valor)} <span className="text-emerald-500">●</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

          {/* perdidos + rodapé */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className={cn(vidro, "px-3.5 py-2 text-sm font-semibold text-rose-600")}>
              🚩 Perdidos no período: {d.perdidosPeriodo}
            </span>
            <div
              className={cn(
                vidro,
                "flex flex-1 flex-wrap items-center justify-around gap-3 px-4 py-2.5"
              )}
            >
              <div className="text-center">
                <p className="text-[11px] font-semibold text-slate-500">📈 Total da semana</p>
                <p className="text-base font-bold tabular-nums text-slate-900">
                  {formatarMoedaKpi(d.rodape.receitaSemana)}
                  {d.rodape.receitaSemanaDeltaPct !== null && (
                    <span
                      className={cn(
                        "ml-1.5 text-xs font-semibold",
                        d.rodape.receitaSemanaDeltaPct >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}
                    >
                      {d.rodape.receitaSemanaDeltaPct >= 0 ? "▲" : "▼"}
                      {Math.abs(d.rodape.receitaSemanaDeltaPct).toFixed(0)}%
                    </span>
                  )}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[11px] font-semibold text-slate-500">👥 Vendedoras ativas</p>
                <p className="text-base font-bold tabular-nums text-slate-900">
                  {d.rodape.vendedorasComVenda}
                  <span className="text-xs font-normal text-slate-500">
                    {" "}
                    de {d.rodape.vendedorasTotal} no time
                  </span>
                </p>
              </div>
              <div className="text-center">
                <p className="text-[11px] font-semibold text-slate-500">🏷️ Maior ticket médio</p>
                <p className="text-base font-bold tabular-nums text-slate-900">
                  {d.rodape.maiorTicketMedio ? formatarMoeda(d.rodape.maiorTicketMedio.valor) : "—"}
                  {d.rodape.maiorTicketMedio && (
                    <span className="ml-1 text-xs font-normal text-slate-500">
                      {d.rodape.maiorTicketMedio.nome}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
