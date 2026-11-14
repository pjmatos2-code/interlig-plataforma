import { ExternalLink, MessageCircle } from "lucide-react";
import { formatarTelefone as fone, type ClienteFidelidade } from "@/lib/sgp/fidelidade";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { cn } from "@/lib/utils";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** clientes da lista: cartões no celular, tabela a partir do tablet */
export function TabelaClientes({
  clientes,
  vencendo,
  mostraGrupo,
  template,
}: {
  clientes: ClienteFidelidade[];
  /** faixas que ainda têm fidelidade: mostra o fim e os dias restantes */
  vencendo: boolean;
  /** lista com mais de um grupo de plano ("Outros" ou todos) */
  mostraGrupo: boolean;
  /** link do SGP com {cliente_id}/{contrato_id} */
  template: string;
}) {
  const linkSgp = (c: ClienteFidelidade) => aplicarLinkSgp(template, { clienteId: c.clienteId, contratoId: c.contrato });
  return (
    <section className="rounded-xl border bg-card shadow-sm">
      {/* celular: um cartão por cliente */}
      <ul className="divide-y md:hidden">
        {clientes.map((c) => (
          <li key={`${c.pop}-${c.contrato}`} className="space-y-2 p-4">
            <div>
              <p className="font-semibold leading-snug">{c.cliente}</p>
              {c.telefone ? (
                <a href={`tel:+55${c.telefone}`} className="text-sm font-medium tabular-nums text-interlig-ceu hover:underline">
                  {fone(c.telefone)}
                </a>
              ) : (
                <p className="text-xs text-muted-foreground">Sem telefone no cadastro — veja no SGP.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Contrato {c.contrato} · {c.unidade}
                {c.mensalidade != null && ` · ${moeda(c.mensalidade)}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.plano ?? "Plano não identificado"}
                {mostraGrupo && ` · ${c.familia}`}
              </p>
            </div>
            {vencendo && c.fim && <FimFidelidade c={c} />}
            <Contato c={c} sgp={linkSgp(c)} />
          </li>
        ))}
      </ul>

      {/* computador: tabela */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="min-w-[12rem] px-4 py-3 font-semibold">Cliente</th>
              <th className="px-3 py-3 font-semibold">Telefone</th>
              <th className="px-3 py-3 font-semibold">Plano</th>
              <th className="px-3 py-3 text-right font-semibold">Mensalidade</th>
              {vencendo && <th className="px-3 py-3 font-semibold">Fim da fidelidade</th>}
              <th className="px-4 py-3 text-right font-semibold">Abrir</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const sgp = linkSgp(c);
              return (
                <tr key={`${c.pop}-${c.contrato}`} className="border-b align-top last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.cliente}</p>
                    <p className="text-xs text-muted-foreground">Contrato {c.contrato} · {c.unidade}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                    {c.telefone ? (
                      <a href={`tel:+55${c.telefone}`} className="hover:underline">{fone(c.telefone)}</a>
                    ) : (
                      <span className="text-xs text-muted-foreground">sem telefone no cadastro</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p>{c.plano ?? "Plano não identificado"}</p>
                    {mostraGrupo && <p className="text-xs text-muted-foreground">{c.familia}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                    {c.mensalidade != null ? moeda(c.mensalidade) : "—"}
                  </td>
                  {vencendo && <td className="whitespace-nowrap px-3 py-3">{c.fim ? <FimFidelidade c={c} /> : "—"}</td>}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {c.telefone && (
                        <a
                          href={`https://wa.me/55${c.telefone}`}
                          target="_blank"
                          rel="noreferrer"
                          title={`WhatsApp de ${c.cliente}`}
                          className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-muted"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                        </a>
                      )}
                      {sgp && (
                        <a
                          href={sgp}
                          target="_blank"
                          rel="noreferrer"
                          title={`Abrir ${c.cliente} no SGP`}
                          className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-muted"
                        >
                          SGP <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FimFidelidade({ c }: { c: ClienteFidelidade }) {
  if (!c.fim) return null;
  const urgente = c.dias != null && c.dias <= 7;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      <span className="tabular-nums">{dataBr(c.fim)}</span>
      {c.dias != null && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-medium",
            urgente ? "bg-farol-vermelho/10 text-farol-vermelho" : "bg-muted text-muted-foreground"
          )}
        >
          {c.dias === 0 ? "vence hoje" : c.dias === 1 ? "falta 1 dia" : `faltam ${c.dias} dias`}
        </span>
      )}
    </span>
  );
}

/** celular: o número já liga (tel:); aqui ficam WhatsApp e SGP */
function Contato({ c, sgp }: { c: ClienteFidelidade; sgp: string | null }) {
  const botao = "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {c.telefone && (
        <a href={`https://wa.me/55${c.telefone}`} target="_blank" rel="noreferrer" className={botao}>
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>
      )}
      {sgp && (
        <a href={sgp} target="_blank" rel="noreferrer" className={botao}>
          SGP <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}
