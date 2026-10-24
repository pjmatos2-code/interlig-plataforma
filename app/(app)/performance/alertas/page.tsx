import Link from "next/link";
import { AlertTriangle, Flame, Sparkles } from "lucide-react";
import { AcoesAlerta } from "@/components/performance/acoes-alerta";
import { fmtDataHora, fmtNum } from "@/components/performance/formato";
import { Kpi } from "@/components/performance/kpi";
import { Painel, Vazio } from "@/components/performance/ui";
import { cn } from "@/lib/utils";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { listarAlertas } from "@/lib/performance/alertas/dados";
import { ROTULO_TIPO_ALERTA } from "@/lib/performance/alertas/regras";
import { contextoPagina, type SearchParams } from "@/lib/performance/pagina";

export const dynamic = "force-dynamic";

const CATEGORIAS = [
  ["", "Todos"],
  ["critico", "Críticos"],
  ["atencao", "Atenção"],
  ["informativo", "Informativos"],
] as const;
const SITUACOES = [
  ["vivos", "Abertos e reconhecidos"],
  ["silenciado", "Silenciados"],
  ["resolvido", "Resolvidos (30 dias)"],
] as const;
const ROTULO_EVENTO: Record<string, string> = {
  criado: "criado",
  repetido: "voltou a acontecer",
  reconhecido: "reconhecido",
  resolvido: "resolvido",
  resolvido_automaticamente: "resolvido sozinho (condição deixou de existir)",
  silenciado: "silenciado",
  reaberto: "reaberto",
};

export default async function AlertasPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await contextoPagina(searchParams);
  const categoria = typeof searchParams.categoria === "string" ? searchParams.categoria : "";
  const tipo = typeof searchParams.tipo === "string" ? searchParams.tipo : null;
  const situacao = (SITUACOES.find(([k]) => k === searchParams.situacao)?.[0] ?? "vivos") as (typeof SITUACOES)[number][0];
  const status = situacao === "vivos" ? (["aberto", "reconhecido"] as const) : situacao === "silenciado" ? (["silenciado"] as const) : (["resolvido"] as const);
  const alertas = await listarAlertas(ctx.escopo, {
    status: [...status],
    categoria: categoria || null,
    tipo,
    desde: situacao === "resolvido" ? new Date(Date.now() - 30 * 86_400_000).toISOString() : null,
  });
  const todosVivos = await listarAlertas(ctx.escopo, { status: ["aberto", "reconhecido"] });
  const admin = criarClienteAdmin();
  // eventos em lotes de 100 ids: lista grande no .in() estoura a URL e volta vazio calado
  const lotes: string[][] = [];
  for (let i = 0; i < alertas.length; i += 100) lotes.push(alertas.slice(i, i + 100).map((a) => a.id));
  const [{ data: vendedores }, eventosLotes] = await Promise.all([
    admin.from("vendedores").select("id, nome"),
    Promise.all(lotes.map((l) => admin.from("alertas_comerciais_eventos").select("alerta_id, evento, criado_em, usuario_id").in("alerta_id", l).order("criado_em", { ascending: false }))),
  ]);
  const eventos = eventosLotes.flatMap((r) => (r.data ?? []) as { alerta_id: string; evento: string; criado_em: string; usuario_id: string | null }[]);
  const nome = new Map((vendedores ?? []).map((v) => [v.id as string, v.nome as string]));
  const eventosPorAlerta = new Map<string, { evento: string; criado_em: string }[]>();
  for (const e of eventos) eventosPorAlerta.set(e.alerta_id as string, [...(eventosPorAlerta.get(e.alerta_id as string) ?? []), { evento: e.evento as string, criado_em: e.criado_em as string }]);
  const qs = (m: Record<string, string | null>) => {
    const n = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => typeof v === "string") as [string, string][]);
    for (const [k, v] of Object.entries(m)) (v === null || v === "" ? n.delete(k) : n.set(k, v));
    return `?${n.toString()}`;
  };
  const conta = (c: string) => todosVivos.filter((a) => a.categoria === c).length;

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <Kpi rotulo="Críticos" valor={fmtNum(conta("critico"))} tom={conta("critico") ? "vermelho" : undefined} contexto="exigem ação agora" />
        <Kpi rotulo="Atenção" valor={fmtNum(conta("atencao"))} tom={conta("atencao") ? "amarelo" : undefined} contexto="acompanhar" />
        <Kpi rotulo="Informativos" valor={fmtNum(conta("informativo"))} contexto="reconhecimento" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {CATEGORIAS.map(([k, r]) => (
          <Link key={k} href={qs({ categoria: k, tipo: null })} className={cn("rounded-md border px-2.5 py-1 text-xs font-medium", categoria === k && !tipo ? "border-interlig-azul bg-interlig-azul text-white" : "hover:bg-muted")}>
            {r}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {SITUACOES.map(([k, r]) => (
          <Link key={k} href={qs({ situacao: k })} className={cn("rounded-md border px-2.5 py-1 text-xs font-medium", situacao === k ? "border-interlig-azul bg-interlig-azul/10 text-interlig-azul" : "hover:bg-muted")}>
            {r}
          </Link>
        ))}
        {tipo && (
          <Link href={qs({ tipo: null })} className="rounded-md bg-muted px-2.5 py-1 text-xs">
            {ROTULO_TIPO_ALERTA[tipo] ?? tipo} ✕
          </Link>
        )}
      </div>

      <Painel
        className="mt-4"
        titulo="Central de alertas"
        descricao="Atualizada pela rotina automática. Alertas iguais são agrupados (contador de ocorrências) e se resolvem sozinhos quando a condição deixa de existir. Críticos só nascem após validação operacional (lead aberto e sem ação humana depois do sinal)."
      >
        {alertas.length === 0 ? (
          <Vazio>Nenhum alerta nesta seleção.</Vazio>
        ) : (
          <ul className="divide-y">
            {alertas.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-3 py-3">
                {a.categoria === "critico" ? <Flame className="mt-0.5 h-5 w-5 shrink-0 text-farol-vermelho" aria-label="Crítico" /> : a.categoria === "atencao" ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-farol-amarelo" aria-label="Atenção" /> : <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-farol-verde" aria-label="Informativo" />}
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{a.titulo}</p>
                  {a.detalhe && <p className="text-sm text-muted-foreground">{a.detalhe}</p>}
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>{ROTULO_TIPO_ALERTA[a.tipo] ?? a.tipo}</span>
                    {a.vendedor_id && <span>{nome.get(a.vendedor_id) ?? ""}</span>}
                    <span>desde {fmtDataHora(a.primeira_em)}</span>
                    {a.ocorrencias > 1 && <span>{a.ocorrencias}ª ocorrência</span>}
                    <span>{a.origem === "ia" ? "sinal da IA validado" : "regra"}</span>
                    <span className="font-medium">{a.status}</span>
                    {a.ticket_id && (
                      <Link href={`/crm/${a.ticket_id}`} className="font-medium text-interlig-azul hover:underline">
                        abrir lead
                      </Link>
                    )}
                  </p>
                  {(eventosPorAlerta.get(a.id) ?? []).length > 0 && (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-muted-foreground">Histórico</summary>
                      <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {(eventosPorAlerta.get(a.id) ?? []).map((e, i) => (
                          <li key={i}>
                            {fmtDataHora(e.criado_em)} — {ROTULO_EVENTO[e.evento] ?? e.evento}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                {ctx.escopo.podeTratarAlertas && <AcoesAlerta id={a.id} status={a.status} />}
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}
