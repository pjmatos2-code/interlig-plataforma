import { exigirPerfil } from "@/lib/auth";
import { avisosEnviados, pessoasAtivas } from "@/lib/avisos/dados";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { ROTULO_PERFIL } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { NovoAviso } from "./novo-aviso";
import { BotaoAtivo } from "./botao-ativo";

export const dynamic = "force-dynamic";

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Santarem", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Avisos (14/10/2026): o gestor escreve e direciona; quem recebe vê um popup
 * e confirma a leitura. Aqui fica o envio e o acompanhamento de quem leu.
 */
export default async function AvisosPage() {
  const usuario = await exigirPerfil(["gestor"]);
  const [pessoas, enviados] = await Promise.all([pessoasAtivas(), avisosEnviados()]);
  const nomePerfil = ROTULO_PERFIL as Record<string, string>;
  const descreverAlvo = (a: (typeof enviados)[number]["alvo"]) => {
    if (a.todos) return "Todos";
    const partes = [
      ...(a.perfis ?? []).map((p) => nomePerfil[p] ?? p),
      ...(a.pops ?? []).map((id) => pessoas.find((p) => p.popId === id)?.pop ?? "unidade"),
    ];
    if ((a.usuarios ?? []).length) partes.push(`${a.usuarios!.length} pessoa(s) escolhida(s)`);
    return partes.join(", ") || "—";
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Avisos"
        descricao="Escreva um aviso e escolha para quem vai. Ele aparece como popup na tela de cada pessoa e só fecha quando ela confirma a leitura."
      />

      <section className="mb-6 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="mb-4 text-base font-semibold">Novo aviso</h2>
        <NovoAviso pessoas={pessoas} rotuloPerfil={nomePerfil} autorId={usuario.id} />
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <h2 className="border-b px-4 py-3 text-base font-semibold sm:px-5">Avisos enviados</h2>
        <ul className="divide-y">
          {enviados.map((a) => {
            const lidos = a.destinatarios.filter((d) => d.lidoEm).length;
            const total = a.destinatarios.length;
            const pct = total ? Math.round((lidos / total) * 100) : 0;
            return (
              <li key={a.id} className={cn("px-4 py-4 sm:px-5", !a.ativo && "opacity-60")}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {a.importancia === "importante" && (
                        <span className="rounded-full bg-farol-vermelho/15 px-2 py-0.5 text-[11px] font-semibold text-farol-vermelho">Importante</span>
                      )}
                      {!a.ativo && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Desativado</span>}
                      <span className="break-words">{a.titulo}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dataHora(a.criadoEm)}
                      {a.autor ? ` · ${a.autor}` : ""} · Para: {descreverAlvo(a.alvo)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="w-40">
                      <p className="text-xs">
                        <strong className="tabular-nums">{lidos}</strong> de {total} confirmaram
                      </p>
                      <span className="mt-1 block h-2 overflow-hidden rounded-full bg-muted">
                        <span className={cn("block h-full rounded-full", pct === 100 ? "bg-farol-verde" : "bg-interlig-ceu")} style={{ width: `${pct}%` }} />
                      </span>
                    </div>
                    <BotaoAtivo id={a.id} ativo={a.ativo} />
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-interlig-azul">Ver mensagem e quem leu</summary>
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-sm">{a.mensagem}</p>
                  <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                    {a.destinatarios.map((d) => (
                      <li key={d.usuarioId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5">
                        <span className="truncate">{d.nome}</span>
                        {d.lidoEm ? (
                          <span className="shrink-0 text-xs text-farol-verde">✓ {dataHora(d.lidoEm)}</span>
                        ) : (
                          <span className="shrink-0 text-xs text-amber-700">pendente</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
          {enviados.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum aviso enviado ainda.</li>}
        </ul>
      </section>
    </>
  );
}
