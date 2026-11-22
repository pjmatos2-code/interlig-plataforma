import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirPerfil } from "@/lib/auth";
import { carregarConferenciaTecnico } from "@/lib/grr/tecnico/conferencia-dados";
import { PERFIS_GRR_TECNICO } from "@/lib/grr/tecnico/tela";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ESTILO = {
  ok: { Icone: CheckCircle2, cor: "text-farol-verde", rotulo: "Em ordem" },
  atencao: { Icone: AlertTriangle, cor: "text-yellow-700", rotulo: "Atenção" },
  problema: { Icone: XCircle, cor: "text-farol-vermelho", rotulo: "Problema" },
} as const;

/** Conferência dos dados do GRR Técnico: o que pode deixar um número errado ou incompleto. Só leitura. */
export default async function ConferenciaTecnicoPage() {
  await exigirPerfil([...PERFIS_GRR_TECNICO]);
  const itens = await carregarConferenciaTecnico();
  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href="/grr/tecnico" className="text-interlig-azul hover:underline">← GRR Técnico</Link>
      </p>
      <CabecalhoPagina titulo="Conferência dos dados do setor técnico" descricao="Antes da reunião: o que pode deixar algum indicador errado ou incompleto, e o que fazer." />
      <ul className="space-y-2">
        {itens.map((i) => {
          const e = ESTILO[i.nivel];
          return (
            <li key={i.chave} className="flex gap-3 rounded-xl border bg-card p-4">
              <e.Icone className={cn("mt-0.5 h-5 w-5 shrink-0", e.cor)} aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {i.titulo} <span className={cn("ml-1 text-xs font-medium", e.cor)}>{e.rotulo}</span>
                </p>
                <p className="text-sm text-muted-foreground">{i.detalhe}</p>
                {i.acao && <p className="mt-1 text-sm">{i.acao}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
