import Link from "next/link";
import { notFound } from "next/navigation";
import { MonitorPlay } from "lucide-react";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { CartaoIndicador } from "@/components/grr/cartao-indicador";
import { FormAtaTecnico, FormCompromissoTecnico, FormEncerrarTecnico, SituacaoCompromissoTecnico } from "@/components/grr/tecnico/reuniao-forms";
import { exigirModulo } from "@/lib/acessos-dados";
import { ROTULO_SITUACAO } from "@/lib/grr/reunioes";
import { lerReuniaoTecnico } from "@/lib/grr/tecnico/reunioes";
import { carregarTelaTecnico } from "@/lib/grr/tecnico/tela";
import { dataBr } from "@/lib/relatorio-semanal/periodo";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Compromisso } from "@/lib/grr/reunioes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const hora = (iso: string) => {
  const d = new Date(Date.parse(iso) - 3 * 3_600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)} às ${d.slice(11, 16)}`;
};

/** Uma reunião operacional do setor técnico: números do período, ata, compromissos e encerramento. */
export default async function ReuniaoTecnicoPage({ params }: { params: { id: string } }) {
  const { unidade: unidadeFixa } = await exigirModulo("grr_tecnico");
  const lida = await lerReuniaoTecnico(params.id);
  if (!lida || (unidadeFixa && lida.reuniao.escopo_rotulo !== unidadeFixa)) notFound();
  const { reuniao: r, compromissos, pendentesAnteriores } = lida;
  const aberta = r.situacao === "aberta";
  const unidade = r.escopo_tipo === "unidade" ? r.escopo_rotulo : undefined;
  const [tela, { data: tecnicos }] = await Promise.all([
    aberta ? carregarTelaTecnico({ semana: r.periodo_inicio, unidade }) : Promise.resolve(null),
    criarClienteAdmin().from("tecnicos").select("id, nome, unidade").eq("ativo", true).order("nome"),
  ]);
  const NOME_UN: Record<string, string> = { atm: "Altamira", vtx: "Vitória do Xingu", bn: "Brasil Novo" };
  const listaTecnicos = (tecnicos ?? [])
    .map((t) => ({ id: String(t.id), nome: String(t.nome), unidade: NOME_UN[String(t.unidade)] ?? String(t.unidade) }))
    .filter((t) => !unidade || t.unidade === unidade);
  const cartoes = aberta ? tela!.cartoes : r.dados?.cartoes ?? [];
  const desvios = cartoes.filter((c) => c.status === "critico" || c.status === "atencao");
  const qs = `?semana=${r.periodo_inicio}${unidade ? `&unidade=${encodeURIComponent(unidade)}` : ""}`;

  const Lista = ({ itens, daReuniao }: { itens: Compromisso[]; daReuniao: boolean }) => (
    <ul className="divide-y rounded-lg border bg-card">
      {itens.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">
            {c.descricao}
            <span className="block text-xs text-muted-foreground">
              {c.responsavel_nome ?? "equipe"}
              {c.prazo ? ` · prazo ${dataBr(c.prazo)}` : ""}
              {!daReuniao ? " · de reunião anterior" : ""}
            </span>
          </span>
          {aberta ? <SituacaoCompromissoTecnico compromisso={c.id} reuniao={r.id} situacao={c.situacao} /> : <span className="text-xs font-medium">{ROTULO_SITUACAO[c.situacao]}</span>}
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href="/grr/tecnico/reunioes" className="text-interlig-azul hover:underline">← Reuniões operacionais</Link>
      </p>
      <CabecalhoPagina
        titulo={`Reunião operacional de ${dataBr(r.data_reuniao)}`}
        descricao={`${r.escopo_rotulo} · semana de ${dataBr(r.periodo_inicio)} a ${dataBr(r.periodo_fim)} · conduzida por ${r.responsavel_nome ?? "—"}`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className={aberta ? "rounded-full bg-farol-amarelo/25 px-2.5 py-0.5 text-xs font-semibold text-yellow-800" : "rounded-full bg-farol-verde/15 px-2.5 py-0.5 text-xs font-semibold text-farol-verde"}>
          {aberta ? "Aberta: números de agora, guardados ao encerrar" : `Encerrada em ${r.encerrada_em ? hora(r.encerrada_em) : "—"}: números guardados`}
        </span>
        <Link href={`/apresentacao/grr-tecnico${qs}`} className="inline-flex items-center gap-1.5 rounded-md bg-interlig-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-interlig-azul/90">
          <MonitorPlay className="h-4 w-4" aria-hidden /> Modo apresentação
        </Link>
      </div>

      <section className="mb-6" aria-labelledby="ind">
        <h2 id="ind" className="mb-2 text-base font-semibold">Indicadores da semana</h2>
        {desvios.length > 0 && <p className="mb-2 text-sm text-muted-foreground">{desvios.length} indicador{desvios.length === 1 ? "" : "es"} fora da meta: comece por eles.</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[...desvios, ...cartoes.filter((c) => !desvios.includes(c))].map((c) => (
            <CartaoIndicador key={c.chave} cartao={c} href={`/grr/tecnico${qs}`} />
          ))}
        </div>
      </section>

      <section className="mb-6 space-y-3" aria-labelledby="comp">
        <h2 id="comp" className="text-base font-semibold">Compromissos</h2>
        {pendentesAnteriores.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-sm font-medium">Em aberto de reuniões anteriores ({pendentesAnteriores.length})</h3>
            <Lista itens={pendentesAnteriores} daReuniao={false} />
          </div>
        )}
        {compromissos.length > 0 ? <Lista itens={compromissos} daReuniao /> : <p className="text-sm text-muted-foreground">Nenhum compromisso desta reunião ainda.</p>}
        {aberta && <FormCompromissoTecnico id={r.id} responsaveis={listaTecnicos.map((t) => t.nome)} />}
      </section>

      <section className="mb-6" aria-labelledby="ata">
        <h2 id="ata" className="mb-2 text-base font-semibold">Ata</h2>
        {aberta ? (
          <FormAtaTecnico id={r.id} tecnicos={listaTecnicos} participantes={r.participantes} observacoes={r.observacoes ?? ""} boasPraticas={r.boas_praticas ?? ""} />
        ) : (
          <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
            <p><span className="font-medium">Participantes:</span> {r.participantes.map((p) => p.nome).join(", ") || "—"}</p>
            <p className="whitespace-pre-line"><span className="font-medium">O que foi discutido:</span> {r.observacoes || "—"}</p>
            <p className="whitespace-pre-line"><span className="font-medium">Boas práticas:</span> {r.boas_praticas || "—"}</p>
          </div>
        )}
      </section>

      {aberta && (
        <section aria-labelledby="enc" className="rounded-xl border bg-card p-4">
          <h2 id="enc" className="mb-1 text-base font-semibold">Encerrar</h2>
          <p className="mb-3 text-sm text-muted-foreground">Guarda a ata e os números de agora. Depois de encerrada, só a situação dos compromissos muda.</p>
          <FormEncerrarTecnico id={r.id} />
        </section>
      )}
    </div>
  );
}
