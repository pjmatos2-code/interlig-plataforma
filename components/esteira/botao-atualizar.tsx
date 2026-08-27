"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { atualizarContratoEsteira, type ResumoAtualizacaoEsteira } from "@/app/(app)/esteira/acoes";

/**
 * 🔄 do card da esteira: consulta o SGP na hora (status, assinaturas, OS).
 * Quando a atualização MUDA o card (assinou, ativou, agendou…), a tela NÃO
 * recarrega sozinha: um aviso mostra o que mudou e para qual coluna o card
 * vai — só move depois do "Entendi". Assim o card não some da vista.
 */
export function BotaoAtualizarContrato({
  contratoId,
  cliente,
}: {
  contratoId: string;
  cliente?: string;
}) {
  const router = useRouter();
  const [aguardando, setAguardando] = useState(false);
  const [resumo, setResumo] = useState<ResumoAtualizacaoEsteira | null>(null);
  const [aviso, setAviso] = useState<ResumoAtualizacaoEsteira | null>(null);

  async function atualizar() {
    setAguardando(true);
    const r = await atualizarContratoEsteira(contratoId);
    setAguardando(false);
    if (r.erro) {
      setResumo(r);
      return;
    }
    const mudouColuna = r.colunaDe && r.colunaPara && r.colunaDe !== r.colunaPara;
    if ((r.mudancas && r.mudancas.length > 0) || mudouColuna) {
      setAviso(r); // segura o refresh até o "Entendi"
    } else {
      setResumo(r);
      router.refresh();
    }
  }

  const mudouColuna = aviso?.colunaDe && aviso?.colunaPara && aviso.colunaDe !== aviso.colunaPara;

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={aguardando}
        onClick={atualizar}
        title="Atualizar este contrato no SGP agora (status, assinaturas, agendamento)"
        className="rounded-md border border-interlig-ceu/40 bg-interlig-ceu/10 px-2 py-0.5 text-xs font-semibold text-interlig-ceu shadow-sm transition-colors hover:bg-interlig-ceu/25 disabled:opacity-50"
      >
        {aguardando ? "⏳" : "🔄"}
      </button>
      {resumo?.erro && <span className="text-[10px] text-destructive">{resumo.erro}</span>}
      {resumo && !resumo.erro && (
        <span className="text-[10px] text-muted-foreground">
          sem mudanças · {resumo.statusSgp} · T{resumo.termoAssinado ? "✓" : "✗"} F
          {resumo.fidelidadeAssinada ? "✓" : "✗"}
        </span>
      )}

      {/* aviso central: o que mudou + para onde o card vai */}
      {aviso && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-2xl">
            <p className="mb-1 text-sm font-bold text-slate-900">
              🔄 Atualização do SGP{cliente ? ` — ${cliente}` : ""}
            </p>
            <ul className="mb-3 space-y-1 text-sm text-slate-700">
              {(aviso.mudancas ?? []).map((m) => (
                <li key={m} className="flex gap-2">
                  <span className="text-interlig-ceu">•</span>
                  <span>{m}</span>
                </li>
              ))}
              {(aviso.mudancas ?? []).length === 0 && (
                <li className="text-slate-500">Dados confirmados no SGP.</li>
              )}
            </ul>
            {mudouColuna ? (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                ➜ O card vai sair de <strong>“{aviso.colunaDe}”</strong> para{" "}
                <strong>“{aviso.colunaPara}”</strong>.
              </p>
            ) : (
              <p className="mb-4 text-xs text-slate-500">O card permanece na mesma coluna.</p>
            )}
            <button
              onClick={() => {
                setAviso(null);
                router.refresh();
              }}
              className="w-full rounded-lg bg-interlig-azul px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              Entendi, atualizar a tela
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
