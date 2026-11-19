import Link from "next/link";
import { AlertTriangle, CalendarClock, ClipboardList, FileText, Presentation } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Alerta } from "@/lib/grr/painel";
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
      <p className="mt-3 text-xs text-muted-foreground">Análises da coordenação e aprovação de planos entram na Etapa 3; a agenda de reuniões, na Etapa 4.</p>
    </Bloco>
  );
}

const SELO_SITUACAO: Record<string, string> = {
  Feito: "border-farol-verde/30 bg-farol-verde/10 text-green-800",
  Parcial: "border-farol-amarelo/40 bg-farol-amarelo/15 text-amber-800",
  "Não feito": "border-farol-vermelho/30 bg-farol-vermelho/10 text-red-800",
  "A conferir": "border-border bg-muted text-muted-foreground",
};

export function CartaoPlanos({ combinado, hrefRelatorio }: { combinado: AcaoConferida[] | null; hrefRelatorio: string | null }) {
  const contagem = combinado
    ? (["Feito", "Parcial", "Não feito", "A conferir"] as const).map((s) => ({ s, n: combinado.filter((a) => (a.situacao ?? "A conferir") === s).length }))
    : [];
  return (
    <Bloco titulo="Planos de ação" icone={ClipboardList}>
      {combinado === null ? (
        <p className="text-sm text-muted-foreground">Planos de ação com responsável, prazo e situação entram na Etapa 3.</p>
      ) : combinado.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma ação combinada na última reunião registrada.</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">Combinado na reunião anterior ({combinado.length})</p>
          <ul className="mb-3 grid grid-cols-2 gap-1.5 text-sm">
            {contagem.map(({ s, n }) => (
              <li key={s} className={cn("flex items-center justify-between rounded-lg border px-2.5 py-1.5", SELO_SITUACAO[s])}>
                <span>{s}</span>
                <b className="tabular-nums">{n}</b>
              </li>
            ))}
          </ul>
          <ul className="space-y-2">
            {combinado.map((a) => (
              <li key={a.n} className="rounded-lg border bg-background px-3 py-2 text-sm">
                <p className="font-medium leading-snug">{a.acao}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {a.situacao ?? "a conferir"} · {a.responsavel || "sem responsável"} · {a.prazo ? `até ${a.prazo}` : "sem prazo"}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            A conferência é feita na reunião; o acompanhamento durante a semana entra na Etapa 3.{" "}
            {hrefRelatorio && (
              <Link href={hrefRelatorio} className="font-medium text-interlig-azul hover:underline">
                Abrir o relatório
              </Link>
            )}
          </p>
        </>
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
