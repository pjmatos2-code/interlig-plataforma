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
import { Bloco, ItemFoco, Kpi } from "@/components/agente/blocos";
import { carregarPainelAtendimento } from "@/lib/agente/atendimento";
import { PainelAtendimentoAgente } from "@/components/agente/painel-atendimento";
import { lerResumoFidelidade } from "@/lib/sgp/fidelidade";
import { vendeERefideliza } from "@/lib/refidelizacao/agentes";

export const dynamic = "force-dynamic";

/**
 * Meu painel (01/10/2026) — página inicial das agentes de venda. Mesmo cartão
 * do módulo Comissões, só com os números da própria agente. A gestão abre o
 * painel de qualquer agente por ?agente= para ver exatamente o que ela vê.
 */
export default async function MeuPainelPage({
  searchParams,
}: {
  searchParams: { mes?: string; agente?: string; visao?: string };
}) {
  const usuario = await exigirUsuario();
  const gestao = ["gestor", "direcao"].includes(usuario.perfil);
  const admin = criarClienteAdmin();

  const { data: comerciais } = gestao
    ? await admin
        .from("vendedores")
        .select("id, nome")
        .eq("ativo", true)
        .in("setor", ["comercial_interno", "comercial_externo", "corporativo", "atendimento"])
        .order("nome")
    : { data: [] };
  // coordenação de unidade (Aline Moraes, Railson): o cadastro de agente é
  // ligado pelo usuario_id, não por usuarios.vendedor_id
  let vendedorProprio = usuario.vendedor_id;
  if (!gestao && !vendedorProprio && usuario.perfil === "supervisor") {
    const { data: vinc } = await admin.from("vendedores").select("id").eq("usuario_id", usuario.id).eq("ativo", true).maybeSingle();
    vendedorProprio = (vinc?.id as string | undefined) ?? null;
  }
  const vendedorId = gestao ? searchParams.agente ?? null : vendedorProprio;

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

  const { data: cadastro } = await admin.from("vendedores").select("nome, setor, sgp_login").eq("id", vendedorId).maybeSingle();

  // Quem vende e ainda refideliza (17/11/2026) tem os dois painéis: abre no de
  // vendas e troca para o de refidelização pelo seletor do topo.
  const duasVisoes = vendeERefideliza(cadastro as { setor: string | null; sgp_login: string | null } | null);
  const verRefidelizacao = duasVisoes && searchParams.visao === "refidelizacao";
  const seletorVisao = duasVisoes && (
    <SeletorVisao
      atual={verRefidelizacao ? "refidelizacao" : "vendas"}
      resto={[gestao ? `agente=${vendedorId}` : "", pedido ? `mes=${pedido.slice(0, 7)}` : ""].filter(Boolean).join("&")}
    />
  );

  // ---------- Atendimento (refidelização): meta fixa de 150, sem cadastro mensal ----------
  if (cadastro?.setor === "atendimento" || verRefidelizacao) {
    const mesA = pedido ?? atual;
    const [pa, resumo, { data: cfgSgp }] = await Promise.all([
      carregarPainelAtendimento(vendedorId, mesA),
      lerResumoFidelidade(),
      admin.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle(),
    ]);
    const sufixo = `${gestao ? `&agente=${vendedorId}` : ""}${verRefidelizacao ? "&visao=refidelizacao" : ""}`;
    const somaFaixa = (f: "sem" | "ate30") => resumo.unidades.reduce((s, u) => s + u.faixas[f], 0);
    return (
      <>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
              {gestao ? `Painel de ${cadastro?.nome ?? "agente"}` : `Olá, ${String(cadastro?.nome ?? "").split(/\s+/)[0]}!`}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Sua meta de refidelização e sua comissão — com a conta de cada número.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {opcoes.map((m) => (
              <Link
                key={m}
                href={`/meu-painel?mes=${m.slice(0, 7)}${sufixo}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm capitalize",
                  m === mesA ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                {nomeMes(m)}
              </Link>
            ))}
          </div>
        </div>
        {seletorVisao}
        {seletorGestao}
        {pa ? (
          <PainelAtendimentoAgente
            p={pa}
            baseSgp={String((cfgSgp?.config as Record<string, string> | null)?.base_url ?? "")}
            semFidelidade={somaFaixa("sem")}
            venceEm30={somaFaixa("ate30")}
          />
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Cadastro sem login do SGP — o vínculo é feito em Administração → Vendedoras.
            </CardContent>
          </Card>
        )}
      </>
    );
  }

  // mês novo ainda sem meta cadastrada: mostra o anterior e avisa. Só vale
  // quando o anterior tem resultado — quem nunca teve meta (agente nova ou em
  // migração para o comercial) fica no mês corrente, com os indicadores dele;
  // antes caía no mês passado, onde também não havia nada para mostrar.
  let mes = pedido ?? atual;
  let p = await carregarPainelComissoes(mes, { vendedorId });
  let semMetaNoMesAtual = false;
  if (!pedido && p.agentes.length === 0) {
    const anterior = await carregarPainelComissoes(mesAtras(atual, 1), { vendedorId });
    if (anterior.agentes.length > 0) {
      semMetaNoMesAtual = true;
      mes = mesAtras(atual, 1);
      p = anterior;
    }
  }
  const a = p.agentes[0] ?? null;

  // coordenação: comissão sobre a base da unidade/equipe — o cartão e a
  // conferência bastam (CRM e vendas próprias não se aplicam)
  if (a && a.base !== "proprias") {
    const [{ data: vc }, linkSgpC] = await Promise.all([
      admin.from("vendedores").select("nome").eq("id", vendedorId).maybeSingle(),
      templateLinkSgp(),
    ]);
    const sufixoC = gestao ? `&agente=${vendedorId}` : "";
    return (
      <>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
              {gestao ? `Painel de ${vc?.nome ?? "agente"}` : `Olá, ${String(vc?.nome ?? "").split(/\s+/)[0]}!`}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sua comissão de coordenação — {a.base === "pop" ? "sobre as ativações da sua unidade" : "sobre as ativações do seu time"}, com a conta e os contratos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {opcoes.map((m) => (
              <Link
                key={m}
                href={`/meu-painel?mes=${m.slice(0, 7)}${sufixoC}`}
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
        </div>
        <CartaoResultadoAgente a={a} linkSgp={linkSgpC} debito={p.debito} />
      </>
    );
  }
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

      {seletorVisao}
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
      ) : x.semCartao ? (
        <ResultadoSemMeta s={x.semCartao} ticketMedio={x.ticketMedio} mes={nomeMes(mes)} />
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

/**
 * Cartão de resultado de quem vende sem meta cadastrada no mês (agente nova
 * ou em migração para o comercial): as vendas contam e aparecem, só não há
 * meta nem comissão de venda para mostrar.
 */
function ResultadoSemMeta({
  s,
  ticketMedio,
  mes,
}: {
  s: NonNullable<ExtrasAgente["semCartao"]>;
  ticketMedio: number;
  mes: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* no celular: vendas em cima, valores lado a lado embaixo; a partir de sm, três colunas */}
      <div className="grid grid-cols-2 sm:grid-cols-3">
        <div className="col-span-2 border-b p-4 sm:col-span-1 sm:border-b-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Vendas no mês</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{num(s.vendas)}</p>
        </div>
        <div className="min-w-0 p-4 sm:border-l">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Mensalidades</p>
          <p className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">{formatarMoeda(s.receita)}</p>
        </div>
        <div className="min-w-0 border-l p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Ticket médio</p>
          <p className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">{formatarMoeda(ticketMedio)}</p>
        </div>
      </div>
      <p className="border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
        Sem meta de venda cadastrada em {mes}. As vendas contam no resultado do time; a comissão de venda ainda não se
        aplica.
      </p>
    </section>
  );
}

/**
 * Troca entre o painel de vendas e o de refidelização, para quem faz os dois.
 * `resto` carrega o que já estava na URL (agente aberto pela gestão, mês).
 */
function SeletorVisao({ atual, resto }: { atual: "vendas" | "refidelizacao"; resto: string }) {
  const opcoes = [
    { chave: "vendas", rotulo: "Vendas", href: `/meu-painel${resto ? `?${resto}` : ""}` },
    { chave: "refidelizacao", rotulo: "Refidelização", href: `/meu-painel?visao=refidelizacao${resto ? `&${resto}` : ""}` },
  ] as const;
  return (
    <nav aria-label="Qual resultado ver" className="mb-4 inline-flex max-w-full rounded-full border bg-muted/40 p-1 text-sm">
      {opcoes.map((o) => (
        <Link
          key={o.chave}
          href={o.href}
          aria-current={o.chave === atual ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-1.5 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            o.chave === atual ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.rotulo}
        </Link>
      ))}
    </nav>
  );
}
const num = (v: number) => v.toLocaleString("pt-BR");
const dec = (v: number) => v.toFixed(1).replace(".", ",");

function Indicadores({ a, x }: { a: AgentePainel | null; x: ExtrasAgente }) {
  // sem cartão de comissão, as pendências vêm das réguas 5.8 e 5.7 (x.semCartao)
  const semAssinatura = a ? a.pendAssinatura : x.semCartao?.semAssinatura ?? 0;
  const comOperacional = a ? a.pendAtivacao : x.semCartao?.aguardandoAtivacao ?? 0;
  const pend = semAssinatura + comOperacional;
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
        href={a ? "#conferir-contratos" : "/esteira"}
        rodape={a || x.semCartao ? `${semAssinatura} sem assinatura · ${comOperacional} com o operacional` : "—"}
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
    !a && x.semCartao && x.semCartao.semAssinatura > 0 && (
      <ItemFoco
        key="ass-sem-meta"
        icone={<AlertTriangle className="h-4 w-4" />}
        tom="bg-farol-vermelho/10 text-farol-vermelho"
        titulo={`${x.semCartao.semAssinatura} ${plural(x.semCartao.semAssinatura, "contrato sem assinatura", "contratos sem assinatura")}`}
        texto="Cobre do cliente a assinatura do Termo de Adesão e da Fidelidade."
        href="/esteira"
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
    { r: "Em atendimento", v: x.funil.emAtendimento, c: "bg-indigo-500" },
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
