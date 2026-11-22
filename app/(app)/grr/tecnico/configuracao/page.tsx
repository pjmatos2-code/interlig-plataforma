import Link from "next/link";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { FormMeta } from "@/components/grr/formularios";
import { Badge } from "@/components/ui/badge";
import { exigirPerfil } from "@/lib/auth";
import { formatarValorDoIndicador, metaVigente } from "@/lib/grr/config";
import { semanaAtual } from "@/lib/grr/semana";
import { GRUPOS_TECNICO, INDICADORES_TECNICO, SETOR_TECNICO } from "@/lib/grr/tecnico/catalogo";
import { lerMetasTecnico, recortesTecnico } from "@/lib/grr/tecnico/dados";
import { dataBr, hojeSantarem } from "@/lib/relatorio-semanal/periodo";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Metas do GRR Técnico (Etapa 2, 21/11/2026): a administração inclui uma meta
 * nova a partir de uma semana (meta não se altera; cada mudança é uma linha
 * nova). É aqui que a diretoria sobe os degraus de corporativo e mudança.
 */
export default async function ConfiguracaoTecnicoPage() {
  await exigirPerfil(["gestor"]);
  const semana = semanaAtual(hojeSantarem());
  const [{ disponivel, metas }, recortes] = await Promise.all([lerMetasTecnico(), recortesTecnico()]);
  const escopos = recortes.map((r) => ({ valor: r.chave.tipo === "empresa" ? "empresa" : `unidade:${r.chave.ref}`, rotulo: r.tipo === "empresa" ? "Empresa" : `Unidade ${r.rotulo}` }));
  const rotuloDe = new Map(recortes.map((r) => [`${r.chave.tipo}:${r.chave.ref ?? ""}`, r.rotulo]));
  const autores = [...new Set(metas.map((m) => m.criado_por).filter((x): x is string => !!x))];
  const { data: usuarios } = autores.length ? await criarClienteAdmin().from("usuarios").select("id, nome").in("id", autores) : { data: [] };
  const nomeDe = new Map((usuarios ?? []).map((u) => [u.id as string, String(u.nome)]));

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href="/grr/tecnico" className="text-interlig-azul hover:underline">
          ← GRR Técnico
        </Link>
      </p>
      <CabecalhoPagina titulo="Metas do GRR Técnico" descricao="Inclua a meta nova e a semana em que ela começa a valer. As metas anteriores ficam guardadas no histórico." />
      {!disponivel ? (
        <p className="rounded-xl border border-dashed bg-card p-4 text-sm">As tabelas do GRR não responderam. Tente de novo em instantes.</p>
      ) : (
        <div className="space-y-6">
          {GRUPOS_TECNICO.map((g) => (
            <section key={g.chave} aria-labelledby={`cfg-${g.chave}`}>
              <h2 id={`cfg-${g.chave}`} className="mb-2 text-base font-semibold tracking-tight">{g.titulo}</h2>
              <div className="space-y-3">
                {INDICADORES_TECNICO.filter((d) => d.grupo === g.chave).map((d) => {
                  const atuais = recortes
                    .map((r) => ({ r, m: metaVigente(metas, d, r.chave, semana.inicio) }))
                    .filter((x) => x.m && (x.r.tipo === "empresa" || !d.herdaMeta || x.m.escopo_tipo === "unidade"));
                  const historico = metas.filter((m) => m.indicador === d.chave);
                  const fmt = (v: number) => formatarValorDoIndicador(v, d.unidade);
                  return (
                    <div key={d.chave} className="space-y-3 rounded-xl border bg-card p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{d.nome}</h3>
                        <Badge variant="outline">{d.polaridade === "maior_melhor" ? "maior é melhor" : "menor é melhor"}</Badge>
                        {atuais.length ? (
                          atuais.map(({ r, m }) => (
                            <Badge key={r.rotulo} variant="secondary">
                              {r.rotulo}: {fmt(m!.meta!)}{d.metaMensal ? " por mês" : ""} · atenção {d.polaridade === "maior_melhor" ? "a partir de" : "até"} {fmt(m!.limite_atencao!)}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline">sem meta</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{d.calculo}</p>
                      <FormMeta indicador={d.chave} unidade={d.unidade} maiorEMelhor={d.polaridade === "maior_melhor"} escopos={escopos} semanaPadrao={semana.inicio} setor={SETOR_TECNICO} metaMensal={d.metaMensal} />
                      {d.herdaMeta ? (
                        <p className="text-xs text-muted-foreground">Taxa: a meta da empresa vale para as unidades que não tiverem meta própria.</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">{d.estoque ? "Estoque: a meta fica só na empresa (decisão de 21/11/2026)." : "Volume: a meta vale só para o recorte em que foi incluída."}</p>
                      )}
                      {historico.length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer font-medium text-interlig-azul">Histórico de metas ({historico.length})</summary>
                          <ul className="mt-2 space-y-1 text-muted-foreground">
                            {historico.map((m) => (
                              <li key={m.id}>
                                A partir de {dataBr(m.vigente_desde)} · {rotuloDe.get(`${m.escopo_tipo}:${m.escopo_ref ?? ""}`) ?? m.escopo_tipo} ·{" "}
                                {m.meta == null ? "meta encerrada" : `meta ${fmt(m.meta)}, atenção ${fmt(m.limite_atencao!)}`}
                                {m.observacao ? ` · ${m.observacao}` : ""} · incluída em {dataBr(m.criado_em.slice(0, 10))}
                                {m.criado_por && nomeDe.get(m.criado_por) ? ` por ${nomeDe.get(m.criado_por)}` : ""}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
