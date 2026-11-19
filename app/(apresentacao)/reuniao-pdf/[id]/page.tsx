import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { AtaDiretoria } from "@/components/grr/reunioes/ata-diretoria";
import { lerAta } from "@/lib/grr/reunioes";
import { correcoesParaImpressao, lerReuniaoParaImpressao, type FotoReuniaoDiretoria } from "@/lib/grr/reunioes-dados";
import { conferirAssinaturaPdf } from "@/lib/relatorio-semanal/assinatura";
import { dataBr, hojeSantarem, rotuloSemana } from "@/lib/relatorio-semanal/periodo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const dataHora = (iso: string) => {
  const d = new Date(Date.parse(iso) - 3 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} às ${d.slice(11, 16)}`;
};

/**
 * Página que o servidor imprime para o PDF da reunião de resultados. Não usa
 * sessão: só abre com o link assinado, que expira em minutos, e só para
 * reunião encerrada (a foto guardada no encerramento).
 */
export default async function ImpressaoReuniao({ params, searchParams }: { params: { id: string }; searchParams: { exp?: string | string[]; sig?: string | string[] } }) {
  const exp = typeof searchParams.exp === "string" ? searchParams.exp : undefined;
  const sig = typeof searchParams.sig === "string" ? searchParams.sig : undefined;
  if (!/^[0-9a-f-]{36}$/.test(params.id) || !conferirAssinaturaPdf(`grr-reuniao:${params.id}`, exp, sig)) notFound();
  const r = await lerReuniaoParaImpressao(params.id);
  if (!r || r.modalidade !== "diretoria" || r.situacao !== "encerrada" || !r.dados) notFound();
  const foto = r.dados as FotoReuniaoDiretoria;
  const correcoes = await correcoesParaImpressao(r.id);
  const ata = { ...foto, ata: lerAta(foto.ata) };
  return (
    <main className="min-h-dvh w-full bg-white text-slate-900">
      <div className="mx-auto max-w-4xl p-6">
      <header className="mb-5 flex items-center justify-between gap-4 rounded-2xl bg-interlig-marinho px-5 py-4 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Reunião de resultados · GRR Comercial</p>
          <h1 className="text-2xl font-bold">{r.escopo_rotulo}</h1>
          <p className="text-sm text-white/80">
            {dataBr(r.data_reuniao)} · semana de {rotuloSemana({ inicio: r.periodo_inicio, fim: r.periodo_fim })} · encerrada em {dataHora(r.encerrada_em!)}
          </p>
        </div>
        <Image src="/marca/logo-fundo-escuro.png" alt="Interlig" width={140} height={44} className="h-9 w-auto" />
      </header>
      <p className="mb-4 text-sm">
        <b>Participantes:</b> {r.participantes.length ? r.participantes.map((p) => p.nome).join(" · ") : "não registrados"}
        {foto.fotoVersao != null ? ` · números da semana congelada (versão ${foto.fotoVersao})` : ""}
      </p>
      <AtaDiretoria foto={ata} reuniaoId={r.id} hoje={hojeSantarem()} />
      {correcoes.length > 0 && (
        <section className="mt-5 border-t pt-4 text-sm">
          <h2 className="text-base font-semibold">Correções registradas depois do encerramento</h2>
          <ul className="mt-2 space-y-1.5">
            {correcoes.map((x) => (
              <li key={x.id}>
                {dataHora(x.criado_em)}: {x.texto}
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </main>
  );
}
