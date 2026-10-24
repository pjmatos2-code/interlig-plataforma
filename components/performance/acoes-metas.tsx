"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  criarMetaPerf,
  definirAdmissaoPerf,
  registrarIndisponibilidadePerf,
  removerIndisponibilidadePerf,
  removerMetaPerf,
  type Resposta,
} from "@/app/(app)/performance/acoes";
import { ROTULO_ESCOPO_META, ROTULO_PERIODICIDADE, TIPOS_META, type EscopoMeta, type TipoMeta } from "@/lib/performance/regras/metas";
import { cn } from "@/lib/utils";

type Opcao = { id: string; nome: string };
const campo = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm";
const UNIDADE: Record<string, string> = { qtd: "quantidade", pct: "% (0–100)", min: "minutos", brl: "R$", pontos: "pontos (0–100)" };

function Retorno({ msg }: { msg: Resposta | null }) {
  if (!msg) return null;
  return (
    <span role="status" className={cn("text-xs", msg.erro ? "text-farol-vermelho" : "text-farol-verde")}>
      {msg.erro ?? msg.ok}
    </span>
  );
}

/** gestor: cadastra meta extra (a mensal de vendas fica em Metas e comissão) */
export function FormMeta({ opcoes, hoje }: { opcoes: { pops: Opcao[]; setores: Opcao[]; coordenadores: Opcao[]; vendedores: Opcao[] }; hoje: string }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<Resposta | null>(null);
  const [tipo, setTipo] = useState<TipoMeta>("ativacoes");
  const [escopo, setEscopo] = useState<EscopoMeta>("global");
  const [referencia, setReferencia] = useState("");
  const [periodicidade, setPeriodicidade] = useState<"dia" | "semana" | "mes">("mes");
  const [inicio, setInicio] = useState(`${hoje.slice(0, 7)}-01`);
  const [fim, setFim] = useState(() => {
    const [a, m] = hoje.split("-").map(Number);
    return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  });
  const [valor, setValor] = useState("");
  const listaRef = escopo === "unidade" ? opcoes.pops : escopo === "equipe" ? opcoes.coordenadores : escopo === "funcao" ? opcoes.setores : escopo === "vendedor" ? opcoes.vendedores : [];
  const info = TIPOS_META[tipo];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await criarMetaPerf({ tipo, escopo, referencia: escopo === "global" ? null : referencia || null, periodicidade, inicio, fim, valor: Number(valor.replace(",", ".")) });
          setMsg(r);
          if (r.ok) setValor("");
        });
      }}
      className="space-y-2"
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMeta)} className={campo}>
            {(Object.keys(TIPOS_META) as TipoMeta[]).map((t) => (
              <option key={t} value={t}>
                {TIPOS_META[t].rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Aplica-se a</span>
          <select
            value={escopo}
            onChange={(e) => {
              setEscopo(e.target.value as EscopoMeta);
              setReferencia("");
            }}
            className={campo}
          >
            {(Object.keys(ROTULO_ESCOPO_META) as EscopoMeta[]).map((k) => (
              <option key={k} value={k}>
                {ROTULO_ESCOPO_META[k]}
              </option>
            ))}
          </select>
        </label>
        {escopo !== "global" && (
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">{ROTULO_ESCOPO_META[escopo]}</span>
            <select value={referencia} onChange={(e) => setReferencia(e.target.value)} className={campo} required>
              <option value="">Escolha…</option>
              {listaRef.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Periodicidade</span>
          <select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as "dia" | "semana" | "mes")} className={campo}>
            {(Object.keys(ROTULO_PERIODICIDADE) as (keyof typeof ROTULO_PERIODICIDADE)[]).map((k) => (
              <option key={k} value={k}>
                {ROTULO_PERIODICIDADE[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Vale de</span>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} required />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">até</span>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={campo} required />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Meta ({UNIDADE[info.unidade]})</span>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={campo} required placeholder={info.unidade === "pct" ? "ex.: 30" : ""} />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {info.rotulo}: {info.ajuda}.{tipo === "vendas" && periodicidade === "mes" ? " A meta mensal de vendas é cadastrada em Metas e comissão." : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pendente || !valor} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-interlig-azul px-3 text-sm font-medium text-white disabled:opacity-50">
          {pendente && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          Cadastrar meta
        </button>
        <Retorno msg={msg} />
      </div>
    </form>
  );
}

export function BotaoDesativarMeta({ id }: { id: string }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<Resposta | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  if (msg?.ok) return <Retorno msg={msg} />;
  return confirmar ? (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" disabled={pendente} onClick={() => iniciar(async () => setMsg(await removerMetaPerf(id)))} className="rounded-md border border-farol-vermelho/40 px-2 py-1 text-xs font-medium text-farol-vermelho hover:bg-farol-vermelho/10">
        {pendente ? "Desativando…" : "Confirmar"}
      </button>
      <button type="button" onClick={() => setConfirmar(false)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
        Voltar
      </button>
      <Retorno msg={msg} />
    </span>
  ) : (
    <button type="button" onClick={() => setConfirmar(true)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
      Desativar
    </button>
  );
}

const TIPOS_AFASTAMENTO = [
  ["ferias", "Férias"],
  ["folga", "Folga"],
  ["afastamento", "Afastamento"],
  ["treinamento", "Treinamento"],
  ["outro", "Outro"],
] as const;

export function FormIndisponibilidade({ vendedores, hoje }: { vendedores: Opcao[]; hoje: string }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<Resposta | null>(null);
  const [vendedorId, setVendedor] = useState("");
  const [tipo, setTipo] = useState("ferias");
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(hoje);
  const [obs, setObs] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await registrarIndisponibilidadePerf({ vendedorId, inicio, fim, tipo, observacao: obs });
          setMsg(r);
          if (r.ok) setObs("");
        });
      }}
      className="space-y-2"
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Vendedor</span>
          <select value={vendedorId} onChange={(e) => setVendedor(e.target.value)} className={campo} required>
            <option value="">Escolha…</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>
            {TIPOS_AFASTAMENTO.map(([k, r]) => (
              <option key={k} value={k}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">De</span>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} required />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Até</span>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={campo} required />
        </label>
      </div>
      <label className="block text-xs">
        <span className="mb-1 block text-muted-foreground">Observação (opcional, sem dados de saúde)</span>
        <input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} className={campo} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pendente || !vendedorId} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-interlig-azul px-3 text-sm font-medium text-white disabled:opacity-50">
          {pendente && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          Registrar
        </button>
        <Retorno msg={msg} />
      </div>
    </form>
  );
}

export function BotaoRemoverIndisponibilidade({ id }: { id: string }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<Resposta | null>(null);
  if (msg?.ok) return <Retorno msg={msg} />;
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" disabled={pendente} onClick={() => iniciar(async () => setMsg(await removerIndisponibilidadePerf(id)))} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
        {pendente ? "Removendo…" : "Remover"}
      </button>
      <Retorno msg={msg} />
    </span>
  );
}

/** gestor: data de admissão (recém-contratado fica em rampa e fora do ranking) */
export function FormAdmissao({ vendedores }: { vendedores: (Opcao & { admitido_em: string | null })[] }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<Resposta | null>(null);
  const [vendedorId, setVendedor] = useState("");
  const [data, setData] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => setMsg(await definirAdmissaoPerf(vendedorId, data || null)));
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <label className="min-w-[12rem] flex-1 text-xs">
        <span className="mb-1 block text-muted-foreground">Vendedor</span>
        <select
          value={vendedorId}
          onChange={(e) => {
            setVendedor(e.target.value);
            setData(vendedores.find((v) => v.id === e.target.value)?.admitido_em ?? "");
          }}
          className={campo}
          required
        >
          <option value="">Escolha…</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-muted-foreground">Admitido em</span>
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
      </label>
      <button type="submit" disabled={pendente || !vendedorId} className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
        {pendente ? "Salvando…" : data ? "Salvar data" : "Limpar data"}
      </button>
      <Retorno msg={msg} />
    </form>
  );
}
