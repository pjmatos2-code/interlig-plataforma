import Link from "next/link";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { FormNovaReuniaoTecnico } from "@/components/grr/tecnico/reuniao-forms";
import { exigirPerfil } from "@/lib/auth";
import { recortesTecnico } from "@/lib/grr/tecnico/dados";
import { listarReunioesTecnico, proximaTerca } from "@/lib/grr/tecnico/reunioes";
import { PERFIS_GRR_TECNICO } from "@/lib/grr/tecnico/tela";
import { dataBr, hojeSantarem } from "@/lib/relatorio-semanal/periodo";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Reuniões operacionais do setor técnico (terças): abrir a da semana e ver as anteriores. */
export default async function ReunioesTecnicoPage() {
  await exigirPerfil([...PERFIS_GRR_TECNICO]);
  const hoje = hojeSantarem();
  const sugestao = proximaTerca(hoje);
  const [{ disponivel, reunioes }, recortes] = await Promise.all([listarReunioesTecnico(), recortesTecnico()]);
  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href="/grr/tecnico" className="text-interlig-azul hover:underline">← GRR Técnico</Link>
      </p>
      <CabecalhoPagina titulo="Reunião operacional" descricao="Toda terça, coordenador técnico e equipe: os números da semana anterior, os desvios, os compromissos e a ata." />
      <h2 className="mb-2 text-base font-semibold">Abrir uma reunião</h2>
      <FormNovaReuniaoTecnico data={sugestao.data} semana={sugestao.periodo.inicio} recortes={recortes.map((r) => ({ valor: r.chave.ref ?? "empresa", rotulo: r.rotulo }))} />
      <h2 className="mb-2 mt-6 text-base font-semibold">Reuniões</h2>
      {!disponivel ? (
        <p className="text-sm text-muted-foreground">As reuniões não responderam. Tente de novo em instantes.</p>
      ) : reunioes.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">Nenhuma reunião registrada ainda.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {reunioes.map((r) => (
            <li key={r.id}>
              <Link href={`/grr/tecnico/reunioes/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50">
                <span>
                  <span className="font-medium">{dataBr(r.data_reuniao)}</span>
                  <span className="text-sm text-muted-foreground"> · {r.escopo_rotulo} · semana de {dataBr(r.periodo_inicio)} a {dataBr(r.periodo_fim)}</span>
                </span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", r.situacao === "encerrada" ? "bg-farol-verde/15 text-farol-verde" : "bg-farol-amarelo/25 text-yellow-800")}>
                  {r.situacao === "encerrada" ? "Encerrada" : "Aberta"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
