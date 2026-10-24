import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { executarSync } from "@/lib/sync/worker";
import { executarRotinasCrm } from "@/lib/crm/rotinas";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 180; // orçamentos internos somam < 150s; teto menor corta o pior caso

/**
 * Worker de sync (PRD 7.1). Responde IMEDIATAMENTE e continua o trabalho em
 * segundo plano (waitUntil) — assim o disparo do cron externo (que desconecta
 * em 30s) nunca mata o ciclo. `?aguardar=1` espera o resultado (uso manual).
 *
 * Só o que precisa seguir o SGP na hora fica aqui. Robôs do SZ (comercial e
 * retenção), ativações da esteira, Meu Dia e relatórios do SGP rodam em
 * /api/sync/rotinas (24/10/2026): neste ciclo o SGP sozinho gasta ~150 s dos
 * 172 s e eles quase nunca tinham vez — ver lib/sync/rotinas.ts.
 */
async function cicloCompleto() {
  const inicioCiclo = Date.now();
  // segundos por etapa, no log da Vercel (24/10/2026): foi medindo que se
  // descobriu que o SGP comia o ciclo inteiro
  const tempos: Record<string, number> = {};
  const medir = (etapa: string, desde: number) => {
    tempos[etapa] = Math.round((Date.now() - desde) / 100) / 10;
  };

  const resultado = await executarSync();
  medir("sgp", inicioCiclo);
  const iniCrm = Date.now();
  const rotinas = await executarRotinasCrm();
  medir("crm", iniCrm);
  // ticket nasce quando a agente ASSUME a conversa (01/10/2026): lê o painel
  // de Monitoramento do SZ (conversas em atendimento) — independe do fluxo
  {
    const ini = Date.now();
    const { sincronizarAtendimentosAbertos } = await import("@/lib/sz/monitor");
    const m = await sincronizarAtendimentosAbertos().catch((e) => ({
      ok: false, abertas: 0, criados: 0, vinculados: 0, erro: String(e),
    }));
    await criarClienteAdmin().from("sync_runs").insert({
      entidade: "sz_atendimentos",
      iniciado_em: new Date(ini).toISOString(),
      finalizado_em: new Date().toISOString(),
      registros: m.criados,
      status: m.ok ? "sucesso" : "erro",
      erro: m.ok ? null : (m as { erro?: string }).erro ?? "falhou",
    }).then(({ error }) => { if (error) console.error("log sz_atendimentos:", error.message); });
    medir("monitor_sz", ini);
  }
  // enriquecimento DURANTE a conversa (leve: até 8 tickets/ciclo): telefone,
  // vendedora e resumo frescos sem esperar o encerramento nem o horário do
  // robô — negociação longa não pode depender da memória da vendedora
  {
    const ini = Date.now();
    const { enriquecerTicketsAbertos } = await import("@/lib/sz/enriquecer");
    const e = await enriquecerTicketsAbertos(25_000).catch((err) => ({
      ok: false, verificados: 0, atualizados: 0, erro: String(err),
    }));
    console.log("enriquecimento SZ:", JSON.stringify(e));
    medir("enriquecimento", ini);
  }
  medir("total", inicioCiclo);
  console.log("ciclo do sync: tempos (s)", JSON.stringify(tempos));
  return { ...resultado, rotinas };
}

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${segredo}`) {
      return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
    }
  }

  // trava de concorrência: não empilha ciclos (janela de 4 min)
  const admin = criarClienteAdmin();
  const corte = new Date(Date.now() - 4 * 60_000).toISOString();
  const { data: emAndamento } = await admin
    .from("sync_runs")
    .select("id")
    .eq("status", "executando")
    .gte("iniciado_em", corte)
    .limit(1);
  if ((emAndamento ?? []).length > 0) {
    return NextResponse.json({ resultado: "ja_em_andamento" });
  }
  // runs zumbis (função morta no meio) são marcadas como erro
  await admin
    .from("sync_runs")
    .update({ status: "erro", erro: "interrompido", finalizado_em: new Date().toISOString() })
    .eq("status", "executando")
    .lt("iniciado_em", corte);

  const url = new URL(request.url);

  // modo econômico (18/09/2026, pós-upgrade Pro): fora do expediente
  // (07-20h Santarém) o ciclo pleno roda a cada ~15 min, não a cada 5 —
  // venda e atendimento não acontecem de madrugada; o cron externo continua
  // chamando e a rota se autorregula. `aguardar=1` (uso manual) ignora.
  const horaStm = new Date(Date.now() - 3 * 3600_000).getUTCHours();
  if ((horaStm < 7 || horaStm >= 20) && url.searchParams.get("aguardar") !== "1") {
    const { data: ultimoCiclo } = await admin
      .from("sync_runs")
      .select("iniciado_em")
      .eq("entidade", "clientes")
      .order("iniciado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultimoCiclo && Date.now() - Date.parse(ultimoCiclo.iniciado_em as string) < 14 * 60_000) {
      return NextResponse.json({ resultado: "economia_noturna" });
    }
  }
  if (url.searchParams.get("aguardar") === "1") {
    const resultado = await cicloCompleto();
    const houveErro = resultado.execucoes.some((e) => e.status === "erro");
    return NextResponse.json(resultado, { status: houveErro ? 500 : 200 });
  }

  waitUntil(
    cicloCompleto().catch((e) => {
      console.error("sync em segundo plano falhou:", e);
    })
  );
  return NextResponse.json({ resultado: "disparado" }, { status: 202 });
}

export const POST = GET;
