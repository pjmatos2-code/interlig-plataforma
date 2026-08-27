"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { atualizarContratoEsteira, type ResumoAtualizacaoEsteira } from "@/app/(app)/esteira/acoes";

/** ⟳ compacto do card: consulta o SGP na hora (status, assinaturas, OS). */
export function BotaoAtualizarContrato({ contratoId }: { contratoId: string }) {
  const router = useRouter();
  const [aguardando, setAguardando] = useState(false);
  const [resumo, setResumo] = useState<ResumoAtualizacaoEsteira | null>(null);

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={aguardando}
        onClick={async () => {
          setAguardando(true);
          const r = await atualizarContratoEsteira(contratoId);
          setResumo(r);
          setAguardando(false);
          if (!r.erro) router.refresh();
        }}
        title="Atualizar este contrato no SGP agora (status, assinaturas, agendamento)"
        className="rounded bg-interlig-ceu/10 px-1.5 py-0.5 text-[11px] font-semibold text-interlig-ceu transition-colors hover:bg-interlig-ceu/20 disabled:opacity-50"
      >
        {aguardando ? "…" : "⟳"}
      </button>
      {resumo?.erro && <span className="text-[10px] text-destructive">{resumo.erro}</span>}
      {resumo && !resumo.erro && (
        <span className="text-[10px] text-muted-foreground">
          {resumo.statusSgp} · T{resumo.termoAssinado ? "✓" : "✗"} F{resumo.fidelidadeAssinada ? "✓" : "✗"}
        </span>
      )}
    </span>
  );
}
