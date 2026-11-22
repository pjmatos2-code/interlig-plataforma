import Link from "next/link";
import { CalendarCheck, ClipboardCheck, MonitorPlay, Settings, Snowflake } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { AreasGrr } from "@/components/grr/areas";
import { CartaoIndicador } from "@/components/grr/cartao-indicador";
import { SeletorSemana } from "@/components/grr/painel/controles";
import { GRUPOS_TECNICO, INDICADORES_TECNICO } from "@/lib/grr/tecnico/catalogo";
import { carregarTelaTecnico, PERFIS_GRR_TECNICO } from "@/lib/grr/tecnico/tela";
import type { CartaoTecnico } from "@/lib/grr/tecnico/regras";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COR_STATUS: Record<CartaoTecnico["status"], string> = {
  ok: "text-farol-verde",
  atencao: "text-yellow-700",
  critico: "text-farol-vermelho",
  sem_meta: "text-foreground",
};

/**
 * GRR Técnico (Etapa 1, 21/11/2026): os nove indicadores aprovados pela gestão,
 * por empresa e unidade, com metas e faróis. Semana atual por padrão;
 * semana congelada mostra a foto do fechamento de segunda. Só leitura.
 */
export default async function GrrTecnicoPage({ searchParams }: { searchParams: { semana?: string; unidade?: string } }) {
  const usuario = await exigirPerfil([...PERFIS_GRR_TECNICO]);
  const t = await carregarTelaTecnico(searchParams);
  const qs = (mudar: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (searchParams.semana) p.set("semana", searchParams.semana);
    if (searchParams.unidade) p.set("unidade", searchParams.unidade);
    for (const [k, v] of Object.entries(mudar)) (v ? p.set(k, v) : p.delete(k));
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const congelado = t.foto
    ? `Semana congelada em ${new Date(Date.parse(t.foto.congelado_em) - 3 * 3_600_000).toISOString().slice(8, 10)}/${new Date(Date.parse(t.foto.congelado_em) - 3 * 3_600_000).toISOString().slice(5, 7)}${t.foto.origem === "rotina" ? " pelo fechamento automático" : ""}${t.foto.versao > 1 ? ` (versão ${t.foto.versao})` : ""}. Os números não mudam mais.`
    : t.emAndamento
      ? "Semana em andamento: números de agora, comparados com os mesmos dias da semana anterior. A semana é congelada na segunda às 07:00."
      : "Números calculados agora: esta semana ainda não tem foto do fechamento (os estoques só existem na foto).";

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">GRR Técnico</h1>
        <p className="mt-1 text-sm text-muted-foreground">Instalações, prazos, qualidade e processo do setor técnico, com as metas aprovadas em 21/11/2026. Lido do SGP; nada aqui altera o SGP.</p>
      </div>
      {usuario.perfil === "gestor" && <AreasGrr ativa="tecnico" parametros="" gestor />}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="lg:max-w-md lg:flex-1">
          <SeletorSemana semana={{ rotulo: t.rotuloDaSemana, tipo: t.semana.tipo, emAndamento: t.emAndamento }} vizinhas={t.vizinhas} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Recorte">
          {t.recortes.map((r) => (
            <Link
              key={r.rotulo}
              href={`/grr/tecnico${qs({ unidade: r.unidade })}`}
              aria-current={r === t.recorte ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", r === t.recorte ? "border-interlig-azul bg-interlig-azul text-white" : "bg-background hover:border-interlig-ceu")}
            >
              {r.rotulo}
            </Link>
          ))}
          <Link
            href={`/apresentacao/grr-tecnico${qs({})}`}
            className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-interlig-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-interlig-azul/90"
          >
            <MonitorPlay className="h-4 w-4" aria-hidden /> Modo apresentação
          </Link>
          <Link href="/grr/tecnico/reunioes" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:border-interlig-ceu">
            <CalendarCheck className="h-4 w-4" aria-hidden /> Reunião de terça
          </Link>
          <Link href="/grr/tecnico/conferencia" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:border-interlig-ceu">
            <ClipboardCheck className="h-4 w-4" aria-hidden /> Conferência
          </Link>
          {usuario.perfil === "gestor" && (
            <Link href="/grr/tecnico/configuracao" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:border-interlig-ceu">
              <Settings className="h-4 w-4" aria-hidden /> Metas
            </Link>
          )}
        </div>
      </div>

      <p className={cn("mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", t.foto ? "border-sky-200 bg-sky-50 text-sky-900" : "bg-card text-muted-foreground")}>
        {t.foto && <Snowflake className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />} {congelado}
        {!t.metasDisponiveis && " As metas do setor técnico ainda não estão cadastradas."}
      </p>

      <div className="space-y-6">
        {GRUPOS_TECNICO.map((g) => {
          const cartoes = t.cartoes.filter((c) => c.grupo === g.chave);
          if (!cartoes.length) return null;
          return (
            <section key={g.chave} aria-labelledby={`g-${g.chave}`}>
              <h2 id={`g-${g.chave}`} className="text-base font-semibold">{g.titulo}</h2>
              <p className="mb-2 text-sm text-muted-foreground">{g.descricao}</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cartoes.map((c) => (
                  <CartaoIndicador key={c.chave} cartao={c} href="/operacao" />
                ))}
              </div>
            </section>
          );
        })}

        <section aria-labelledby="por-unidade">
          <h2 id="por-unidade" className="text-base font-semibold">Por unidade</h2>
          <p className="mb-2 text-sm text-muted-foreground">Os mesmos indicadores lado a lado. As taxas das unidades usam a meta da empresa; os estoques têm meta só na empresa.</p>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[640px] text-sm tabular-nums">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Indicador</th>
                  {t.porRecorte.map((x) => (
                    <th key={x.recorte.rotulo} className="px-3 py-2 text-right font-medium">{x.recorte.rotulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INDICADORES_TECNICO.map((d) => (
                  <tr key={d.chave} className="border-t">
                    <td className="px-3 py-2">{d.nome}</td>
                    {t.porRecorte.map((x) => {
                      const c = x.cartoes.find((k) => k.chave === d.chave);
                      return (
                        <td key={x.recorte.rotulo} className={cn("px-3 py-2 text-right font-medium", c && COR_STATUS[c.status])}>
                          {c?.valor ?? "—"}
                          {c?.metaNumero != null && <span className="block text-[11px] font-normal text-muted-foreground">{c.meta}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <details className="rounded-lg border bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">Como cada indicador é calculado</summary>
          <dl className="mt-2 space-y-2">
            {INDICADORES_TECNICO.map((d) => (
              <div key={d.chave}>
                <dt className="font-medium">{d.nome}</dt>
                <dd className="text-muted-foreground">{d.calculo}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </div>
  );
}
