import Link from "next/link";
import { ExternalLink, FileDown } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { contagemStatus } from "@/lib/relatorio-semanal/placar";
import { hojeSantarem, rotuloSemana, somarDias, ultimaSemanaCompleta } from "@/lib/relatorio-semanal/periodo";
import type { ItemPlacar } from "@/lib/relatorio-semanal/tipos";
import { lerConfigEnvio } from "@/lib/relatorio-semanal/config";
import { lerConfigEmail } from "@/lib/email/enviar";
import { ConfigEnvio, EnviarRelatorio, GerarRelatorio, ReescreverTextos } from "./painel";

export const dynamic = "force-dynamic";
// ler o banco e escrever os textos leva de 1 a 3 minutos
export const maxDuration = 300;

/**
 * Relatório da diretoria (04/11/2026): lista dos relatórios semanais e o
 * botão para gerar o de uma semana. O relatório abre fora do menu, no
 * visual do modelo aprovado pela diretoria.
 */
export default async function RelatoriosPage() {
  const usuario = await exigirPerfil(["gestor", "direcao"]);
  const admin = criarClienteAdmin();
  const [{ data }, cfgEnvio, cfgEmail] = await Promise.all([
    admin
      .from("relatorios_semanais")
      .select("id, semana_inicio, semana_fim, gerado_em, textos_erro, placar:dados->placar")
      .order("semana_inicio", { ascending: false })
      .limit(30),
    lerConfigEnvio(),
    lerConfigEmail(),
  ]);
  const relatorios = (data ?? []) as { id: string; semana_inicio: string; semana_fim: string; gerado_em: string; textos_erro: string | null; placar: ItemPlacar[] | null }[];
  // o último envio de cada relatório
  const { data: enviosBrutos } = relatorios.length
    ? await admin
        .from("relatorios_envios")
        .select("relatorio_id, para, enviado, com_pdf, automatico, enviado_em, erro")
        .in("relatorio_id", relatorios.map((r) => r.id))
        .order("enviado_em", { ascending: false })
        .limit(300)
    : { data: [] };
  type Envio = { relatorio_id: string; para: string[]; enviado: boolean; com_pdf: boolean; automatico: boolean; enviado_em: string; erro: string | null };
  const ultimoEnvio = new Map<string, Envio>();
  for (const e of (enviosBrutos ?? []) as Envio[]) if (!ultimoEnvio.has(e.relatorio_id)) ultimoEnvio.set(e.relatorio_id, e);
  const emailPronto = Boolean(cfgEmail.usuario && cfgEmail.senha);
  const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Santarem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const ultima = ultimaSemanaCompleta(hojeSantarem());
  const semanas = Array.from({ length: 8 }, (_, i) => {
    const inicio = somarDias(ultima.inicio, -7 * i);
    return { inicio, rotulo: rotuloSemana({ inicio, fim: somarDias(inicio, 6) }), existe: relatorios.some((r) => r.semana_inicio === inicio) };
  });

  return (
    <>
      <CabecalhoPagina
        titulo="Relatório da diretoria"
        descricao="O Relatório Comercial Semanal no formato da diretoria: placar dos dez indicadores, vendas, esteira, base, retenção, insights e as perguntas da reunião de segunda. Os números saem do banco, com a mesma conta das telas; os textos são escritos pelo Claude a partir deles."
      />

      <section className="mb-6 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold">Gerar agora</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Escolha a semana (segunda a domingo). Gerar de novo uma semana atualiza os números e os textos e mantém o que já
          foi digitado na reunião.
        </p>
        <GerarRelatorio semanas={semanas} />
      </section>

      <section className="mb-6 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold">Envio por e-mail</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          O relatório vai em PDF, anexado a um e-mail com o resumo da semana no corpo.{" "}
          {emailPronto ? (
            <>
              Sai de <strong className="font-medium text-foreground">{cfgEmail.usuario}</strong>, que recebe uma cópia oculta de cada envio.
            </>
          ) : usuario.perfil === "gestor" ? (
            <>
              Falta cadastrar a caixa que envia em{" "}
              <Link href="/admin/integracoes" className="font-medium text-interlig-azul underline">
                Administração → Integrações
              </Link>
              .
            </>
          ) : (
            <>Falta o gestor cadastrar a caixa que envia, em Administração → Integrações.</>
          )}
        </p>
        <ConfigEnvio inicial={{ para: cfgEnvio.para.join(", "), saudacao: cfgEnvio.saudacao, automatico: cfgEnvio.automatico }} />
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <h2 className="border-b px-4 py-3 text-base font-semibold sm:px-5">Relatórios gerados</h2>
        {relatorios.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhum relatório gerado ainda.</p>
        ) : (
          <ul className="divide-y">
            {relatorios.map((r) => {
              const c = r.placar ? contagemStatus(r.placar) : null;
              const envio = ultimoEnvio.get(r.id);
              return (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <p className="font-medium">Semana de {rotuloSemana({ inicio: r.semana_inicio, fim: r.semana_fim })}</p>
                    <p className="text-xs text-muted-foreground">
                      Gerado em {new Date(r.gerado_em).toLocaleString("pt-BR", { timeZone: "America/Santarem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {c && ` · ${c.critico} críticos, ${c.atencao} em atenção, ${c.ok} ok${c.sem_meta ? `, ${c.sem_meta} sem meta` : ""}`}
                    </p>
                    {r.textos_erro && <p className="text-xs text-farol-vermelho">Textos não escritos: {r.textos_erro}</p>}
                    {envio && (
                      <p className={`text-xs ${!envio.enviado ? "text-farol-vermelho" : envio.erro ? "text-amber-700" : "text-muted-foreground"}`}>
                        {envio.enviado
                          ? `${envio.automatico ? "Enviado sozinho" : "Enviado"} para ${envio.para.join(", ")} em ${quando(envio.enviado_em)}${envio.com_pdf ? ", com o PDF" : ""}${envio.erro ? ` · ${envio.erro}` : ""}`
                          : `Envio de ${quando(envio.enviado_em)} não saiu: ${envio.erro ?? "erro sem detalhe"}`}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    {r.textos_erro && <ReescreverTextos id={r.id} />}
                    <a
                      href={`/api/relatorios/semanal/${r.id}/pdf`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted"
                    >
                      <FileDown className="h-3.5 w-3.5" /> PDF
                    </a>
                    <EnviarRelatorio id={r.id} paraPadrao={cfgEnvio.para.join(", ")} pronto={emailPronto} />
                    <a
                      href={`/relatorios/semanal/${r.id}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-interlig-azul px-3 text-sm font-semibold text-white hover:bg-interlig-azul/90"
                    >
                      Abrir relatório <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
