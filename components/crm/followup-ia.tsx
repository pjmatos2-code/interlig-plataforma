"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { analisarFollowup } from "@/app/(app)/crm/acoes";

const COR: Record<string, string> = {
  quente: "bg-emerald-100 text-emerald-900 border-emerald-300",
  morno: "bg-amber-100 text-amber-900 border-amber-300",
  frio: "bg-sky-100 text-sky-900 border-sky-300",
  perdido: "bg-slate-100 text-slate-700 border-slate-300",
};

export type AnaliseFollowup = {
  interesse: string;
  situacao: string;
  pendencia: string;
  proxima_acao: string;
  quando: string;
};

/**
 * Bloco do follow-up sugerido pela IA, no detalhe do ticket. A análise lê a
 * conversa do SZ vinculada — a agente não precisa colar nada.
 */
export function FollowupIa({
  ticketId,
  analise,
  analisadoEm,
  temConversa,
}: {
  ticketId: string;
  analise: AnaliseFollowup | null;
  analisadoEm: string | null;
  temConversa: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function rodar() {
    setOcupado(true);
    setErro(null);
    const r = await analisarFollowup(ticketId);
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    router.refresh();
  }

  if (!temConversa && !analise) return null;

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-indigo-950">
          <Sparkles className="h-5 w-5 text-interlig-azul" /> Follow-up sugerido (IA)
        </p>
        {temConversa && (
          <button
            type="button"
            disabled={ocupado}
            onClick={rodar}
            className="inline-flex items-center gap-1.5 rounded-md border border-indigo-300 bg-card px-3 py-1.5 text-xs font-medium text-interlig-azul hover:bg-indigo-50 disabled:opacity-50"
            title="Lê a conversa do SZ e atualiza a sugestão"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {ocupado ? "Analisando…" : analise ? "Reanalisar" : "Analisar conversa"}
          </button>
        )}
      </div>
      <div className="space-y-2 px-4 pb-3 pt-2 text-sm">
        {erro && <p className="text-xs text-farol-vermelho">{erro}</p>}
        {analise ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase ${COR[analise.interesse] ?? COR.frio}`}
              >
                {analise.interesse}
              </span>
              <span className="text-xs text-muted-foreground">
                agir: {analise.quando}
                {analisadoEm && ` · analisado em ${analisadoEm.slice(8, 10)}/${analisadoEm.slice(5, 7)} ${analisadoEm.slice(11, 16)}`}
              </span>
            </div>
            <p><strong>Situação:</strong> {analise.situacao}</p>
            <p><strong>Pendência:</strong> {analise.pendencia}</p>
            <p className="rounded-md bg-sky-50 px-3 py-2">
              ➜ <strong>{analise.proxima_acao}</strong>
            </p>
            <p className="text-[11px] text-muted-foreground">
              Sugestão gerada pela leitura da conversa — confira antes de agir.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Clique em “Analisar conversa” para a IA ler o atendimento do SZ e sugerir o próximo passo.
          </p>
        )}
      </div>
    </div>
  );
}
