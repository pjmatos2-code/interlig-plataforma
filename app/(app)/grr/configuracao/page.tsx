import Link from "next/link";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { AreasGrr } from "@/components/grr/areas";
import { FormIndicador, FormMeta } from "@/components/grr/formularios";
import { Badge } from "@/components/ui/badge";
import { exigirPerfil } from "@/lib/auth";
import { GRUPOS_GRR, INDICADORES_GRR } from "@/lib/grr/catalogo";
import { formatarValorDoIndicador, metaVigente } from "@/lib/grr/config";
import { lerConfigGrr } from "@/lib/grr/config-dados";
import { carregarCadastroGrr } from "@/lib/grr/dados";
import { agentesDeVenda } from "@/lib/grr/escopo";
import { semanaAtual } from "@/lib/grr/semana";
import { dataBr, hojeSantarem, mesDeReferencia } from "@/lib/relatorio-semanal/periodo";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Configuração do GRR (só a administração): quais indicadores aparecem, o dono de cada um e as metas com faixa de atenção. */
export default async function GrrConfiguracaoPage() {
  await exigirPerfil(["gestor"]);
  const hoje = hojeSantarem();
  const semana = semanaAtual(hoje);
  const [config, cadastro] = await Promise.all([lerConfigGrr(), carregarCadastroGrr(mesDeReferencia(semana).de)]);
  const porChave = new Map(config.indicadores.map((i) => [i.chave, i]));

  const rotuloDoRecorte = new Map<string, string>([["empresa:", "Empresa"]]);
  for (const p of cadastro.pops) rotuloDoRecorte.set(`unidade:${p.id}`, `Unidade ${p.nome}`);
  for (const e of cadastro.equipes) rotuloDoRecorte.set(`equipe:${e.coordenadorId}`, `Equipe de ${e.nome}`);
  for (const v of agentesDeVenda(cadastro.vendedores)) rotuloDoRecorte.set(`agente:${v.id}`, `Agente ${v.nome}`);
  const escopos = [...rotuloDoRecorte.entries()].map(([valor, rotulo]) => ({ valor: valor === "empresa:" ? "empresa" : valor, rotulo }));

  const autores = [...new Set(config.metas.map((m) => m.criado_por).filter((x): x is string => !!x))];
  const { data: usuarios } = autores.length ? await criarClienteAdmin().from("usuarios").select("id, nome").in("id", autores) : { data: [] };
  const nomeDe = new Map((usuarios ?? []).map((u) => [u.id as string, String(u.nome)]));

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href="/grr" className="text-interlig-azul hover:underline">
          ← Resumo executivo
        </Link>
      </p>
      <CabecalhoPagina titulo="Configuração do GRR" descricao="Indicadores do Comercial: o que aparece no painel, quem é o dono e a meta de cada um." />
      <AreasGrr ativa="configuracao" parametros="" gestor />

      {!config.disponivel ? (
        <div className="rounded-xl border border-dashed bg-card p-4 text-sm">
          <p className="font-medium">A configuração entra em funcionamento quando as tabelas do GRR forem criadas no banco.</p>
          <p className="mt-1 text-muted-foreground">Falta aplicar a migração 0134. Até lá, o painel usa só as regras da plataforma.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {GRUPOS_GRR.filter((g) => g.etapa === 1).map((grupo) => (
            <section key={grupo.chave} aria-labelledby={`cfg-${grupo.chave}`}>
              <h2 id={`cfg-${grupo.chave}`} className="mb-2 text-base font-semibold tracking-tight">
                {grupo.titulo}
              </h2>
              <div className="space-y-3">
                {INDICADORES_GRR.filter((i) => i.grupo === grupo.chave).map((def) => {
                  const cfg = porChave.get(def.chave);
                  const daEmpresa = metaVigente(config.metas, def, { tipo: "empresa", ref: null }, semana.inicio);
                  const historico = config.metas.filter((m) => m.indicador === def.chave);
                  return (
                    <div key={def.chave} className="space-y-3 rounded-xl border bg-card p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{def.nome}</h3>
                        <Badge variant="outline">{def.polaridade === "maior_melhor" ? "maior é melhor" : "menor é melhor"}</Badge>
                        {def.metaOrigem === "grr" &&
                          (daEmpresa ? (
                            <Badge variant="secondary">
                              meta da empresa: {formatarValorDoIndicador(daEmpresa.meta!, def.unidade)} · atenção {def.polaridade === "maior_melhor" ? "a partir de" : "até"}{" "}
                              {formatarValorDoIndicador(daEmpresa.limite_atencao!, def.unidade)}
                            </Badge>
                          ) : (
                            <Badge variant="outline">sem meta na empresa</Badge>
                          ))}
                      </div>
                      <FormIndicador chave={def.chave} ativo={cfg?.ativo !== false} dono={cfg?.dono ?? ""} />
                      {def.metaOrigem === "plataforma" ? (
                        <p className="text-xs text-muted-foreground">
                          Meta definida pela plataforma, não pelo GRR. {def.regraDaMeta}{" "}
                          {def.grupo === "vendas" && (
                            <Link href="/metas" className="text-interlig-azul hover:underline">
                              Abrir Metas e comissão
                            </Link>
                          )}
                        </p>
                      ) : (
                        <>
                          <FormMeta indicador={def.chave} unidade={def.unidade} maiorEMelhor={def.polaridade === "maior_melhor"} escopos={escopos} semanaPadrao={semana.inicio} />
                          {!def.herdaMeta && <p className="text-xs text-muted-foreground">Este indicador é um volume: a meta vale só para o recorte em que foi incluída.</p>}
                          {historico.length > 0 && (
                            <details className="text-xs">
                              <summary className="cursor-pointer font-medium text-interlig-azul">Histórico de metas ({historico.length})</summary>
                              <ul className="mt-2 space-y-1 text-muted-foreground">
                                {historico.map((m) => (
                                  <li key={m.id}>
                                    A partir de {dataBr(m.vigente_desde)} · {rotuloDoRecorte.get(`${m.escopo_tipo}:${m.escopo_ref ?? ""}`) ?? m.escopo_tipo} ·{" "}
                                    {m.meta == null ? "meta encerrada" : `meta ${formatarValorDoIndicador(m.meta, def.unidade)}, atenção ${formatarValorDoIndicador(m.limite_atencao!, def.unidade)}`}
                                    {m.observacao ? ` · ${m.observacao}` : ""} · incluída em {dataBr(m.criado_em.slice(0, 10))}
                                    {m.criado_por && nomeDe.get(m.criado_por) ? ` por ${nomeDe.get(m.criado_por)}` : ""}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </>
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
