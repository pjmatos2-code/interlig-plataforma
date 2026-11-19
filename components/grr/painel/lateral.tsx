import Link from "next/link";
import { AlertTriangle, CalendarClock, ClipboardList, FileText, Presentation } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Alerta } from "@/lib/grr/painel";
import type { ContagemPlanos } from "@/lib/grr/planos";
import type { AcaoConferida } from "@/lib/grr/reuniao-dados";

const dataBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

export type ProximaReuniao = {
  semanaRotulo: string;
  /** data e participantes registrados no relatório da diretoria */
  data: string | null;
  participantes: string | null;
  /** relatório da semana: gerado, ainda não gerado ou sem acesso (coordenação) */
  relatorio: "gerado" | "nao_gerado" | "sem_acesso";
  congelada: boolean;
  hrefApresentar: string;
  hrefPreparar: string | null;
  /** desvios sem diagnóstico no recorte e planos aguardando a diretoria (null antes da Etapa 3 no banco) */
  pendencias: { semDiagnostico: number; aguardandoAprovacao: number } | null;
};

function Bloco({ titulo, icone: Icone, children, className }: { titulo: string; icone: typeof FileText; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 shadow-sm", className)} aria-label={titulo}>
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold tracking-tight">
        <Icone className="h-5 w-5 text-interlig-azul" aria-hidden />
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export function CartaoProximaReuniao({ r }: { r: ProximaReuniao }) {
  return (
    <Bloco titulo="Próxima reunião" icone={CalendarClock} className="bg-gradient-to-b from-interlig-azul/[0.06] to-card">
      <p className="font-semibold">Reunião de resultados · Comercial</p>
      <p className="text-sm text-muted-foreground">Semana de {r.semanaRotulo}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Data</dt>
          <dd className="text-right font-medium">{r.data ? dataBr(r.data) : r.relatorio === "sem_acesso" ? "—" : "Ainda sem data definida"}</dd>
        </div>
        {r.participantes && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Participantes</dt>
            <dd className="text-right font-medium">{r.participantes}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Números</dt>
          <dd className="text-right font-medium">{r.congelada ? "Semana congelada" : "Ainda não congelados"}</dd>
        </div>
        {r.relatorio !== "sem_acesso" && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Relatório da diretoria</dt>
            <dd className="text-right font-medium">{r.relatorio === "gerado" ? "Gerado" : "Ainda não gerado"}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4 grid gap-2">
        <Link href={r.hrefApresentar} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-interlig-azul px-4 text-sm font-semibold text-white hover:bg-interlig-azul/90">
          <Presentation className="h-4 w-4" aria-hidden /> Apresentar reunião
        </Link>
        {r.hrefPreparar && (
          <Link href={r.hrefPreparar} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium hover:border-interlig-ceu">
            <FileText className="h-4 w-4" aria-hidden /> Preparar no relatório da diretoria
          </Link>
        )}
      </div>
      {r.pendencias && (
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link href="/grr/planos?filtro=aprovacao" className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/60">
              <span>Planos aguardando a diretoria</span>
              <b className="tabular-nums">{r.pendencias.aguardandoAprovacao}</b>
            </Link>
          </li>
          <li className="flex items-center justify-between rounded-lg px-2 py-1.5">
            <span>Desvios sem diagnóstico (semana na tela)</span>
            <b className={cn("tabular-nums", r.pendencias.semDiagnostico > 0 && "text-amber-700")}>{r.pendencias.semDiagnostico}</b>
          </li>
        </ul>
      )}
    </Bloco>
  );
}

const SELO_SITUACAO: Record<string, string> = {
  Feito: "border-farol-verde/30 bg-farol-verde/10 text-green-800",
  Parcial: "border-farol-amarelo/40 bg-farol-amarelo/15 text-amber-800",
  "Não feito": "border-farol-vermelho/30 bg-farol-vermelho/10 text-red-800",
  "A conferir": "border-border bg-muted text-muted-foreground",
};

export function CartaoPlanos({ planos, combinado, hrefRelatorio }: { planos: ContagemPlanos | null; combinado: AcaoConferida[] | null; hrefRelatorio: string | null }) {
  const linhas: [string, number, string, string][] = planos
    ? [
        ["Aguardando a diretoria", planos.aguardandoAprovacao, "aprovacao", "bg-farol-amarelo"],
        ["Pendentes", planos.pendente, "pendente", "bg-slate-400"],
        ["Em andamento", planos.em_andamento, "em_andamento", "bg-interlig-ceu"],
        ["Aguardando validação", planos.aguardando_validacao, "aguardando_validacao", "bg-farol-amarelo"],
        ["Atrasados", planos.atrasada, "atrasada", "bg-farol-vermelho"],
        ["Concluídos", planos.concluida, "concluida", "bg-farol-verde"],
      ]
    : [];
  const conferencia = combinado
    ? (["Feito", "Parcial", "Não feito", "A conferir"] as const).map((s) => ({ s, n: combinado.filter((a) => (a.situacao ?? "A conferir") === s).length }))
    : [];
  return (
    <Bloco titulo="Planos de ação" icone={ClipboardList}>
      {planos === null ? (
        <p className="text-sm text-muted-foreground">Os planos entram em funcionamento quando as tabelas da Etapa 3 forem criadas.</p>
      ) : (
        <ul className="space-y-1">
          {linhas.map(([rotulo, n, filtro, cor]) => (
            <li key={filtro}>
              <Link href={`/grr/planos?filtro=${filtro}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", cor)} aria-hidden />
                <span className="flex-1">{rotulo}</span>
                <b className={cn("tabular-nums", filtro === "atrasada" && n > 0 && "text-red-700")}>{n}</b>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {combinado && combinado.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-2 text-xs text-muted-foreground">Checklist da reunião anterior (Relatório da diretoria)</p>
          <ul className="grid grid-cols-2 gap-1.5 text-xs">
            {conferencia.map(({ s, n }) => (
              <li key={s} className={cn("flex items-center justify-between rounded-lg border px-2 py-1", SELO_SITUACAO[s])}>
                <span>{s}</span>
                <b className="tabular-nums">{n}</b>
              </li>
            ))}
          </ul>
          {hrefRelatorio && (
            <Link href={hrefRelatorio} className="mt-2 inline-block text-xs font-medium text-interlig-azul hover:underline">
              Abrir o relatório
            </Link>
          )}
        </div>
      )}
    </Bloco>
  );
}

export function CartaoAlertas({ alertas, parametros }: { alertas: Alerta[]; parametros: string }) {
  return (
    <Bloco titulo="Principais alertas" icone={AlertTriangle}>
      {alertas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum indicador em atenção ou crítico no período.</p>
      ) : (
        <ul className="space-y-2">
          {alertas.map((a) => (
            <li key={a.titulo}>
              <Link
                href={`/grr/${a.grupo}${parametros}`}
                className={cn(
                  "block rounded-lg border px-3 py-2 text-sm hover:border-interlig-ceu",
                  a.nivel === "critico" ? "border-farol-vermelho/30 bg-farol-vermelho/[0.07]" : "border-farol-amarelo/40 bg-farol-amarelo/[0.09]"
                )}
              >
                <p className="flex items-start gap-2 font-medium leading-snug">
                  <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", a.nivel === "critico" ? "text-farol-vermelho" : "text-farol-amarelo")} aria-hidden />
                  <span>
                    <span className="sr-only">{a.nivel === "critico" ? "Crítico: " : "Atenção: "}</span>
                    {a.titulo}
                  </span>
                </p>
                {a.texto && <p className="mt-0.5 pl-6 text-xs text-muted-foreground">{a.texto}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  );
}
