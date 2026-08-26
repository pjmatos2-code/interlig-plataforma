"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  adicionarNota,
  adicionarProposta,
  agendarFollowup,
  excluirTicket,
  fecharTicket,
  registrarTratativa,
  mudarEtapa,
  reabrirTicket,
  reatribuirTicket,
  type EstadoAcao,
} from "../acoes";
import { formatarMoeda } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ROTULO_ETAPA, ROTULO_ORIGEM, type CategoriaOrigem, type EtapaTicket } from "@/lib/tipos";

const inicial: EstadoAcao = {};
const ETAPAS: EtapaTicket[] = ["novo", "em_atendimento", "proposta", "aguardando"];

function BotaoEnviar({ rotulo, variante }: { rotulo: string; variante?: "default" | "destructive" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variante} disabled={pending}>
      {pending ? "Enviando…" : rotulo}
    </Button>
  );
}

function Erro({ estado }: { estado: EstadoAcao }) {
  if (!estado.erro) return null;
  return (
    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{estado.erro}</p>
  );
}

// ---------------------------------------------------------------------------
export function BarraEtapas({ ticketId, etapaAtual }: { ticketId: string; etapaAtual: EtapaTicket }) {
  const router = useRouter();
  const [aguardando, setAguardando] = useState<string | null>(null);

  if (etapaAtual === "fechado") return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {ETAPAS.map((etapa) => (
        <button
          key={etapa}
          type="button"
          disabled={etapa === etapaAtual || aguardando !== null}
          onClick={async () => {
            setAguardando(etapa);
            await mudarEtapa(ticketId, etapa);
            setAguardando(null);
            router.refresh();
          }}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            etapa === etapaAtual
              ? "border-primary bg-primary text-primary-foreground"
              : "hover:border-interlig-ceu",
            aguardando === etapa && "opacity-50"
          )}
        >
          {ROTULO_ETAPA[etapa]}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function FormularioFechamento({
  ticketId,
  telefone,
  cpf,
  planos,
  motivos,
}: {
  ticketId: string;
  telefone: string | null;
  cpf: string | null;
  planos: { id: string; nome: string }[];
  motivos: { id: string; nome: string }[];
}) {
  const [estado, acao] = useFormState(fecharTicket, inicial);
  const [desfecho, setDesfecho] = useState<"convertido" | "nao_convertido" | "">("");

  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="ticket_id" value={ticketId} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDesfecho("convertido")}
          className={cn(
            "flex-1 rounded-md border px-3 py-2 text-sm font-medium",
            desfecho === "convertido"
              ? "border-farol-verde bg-farol-verde/10 text-farol-verde"
              : "hover:border-farol-verde/60"
          )}
        >
          ✓ Convertido
        </button>
        <button
          type="button"
          onClick={() => setDesfecho("nao_convertido")}
          className={cn(
            "flex-1 rounded-md border px-3 py-2 text-sm font-medium",
            desfecho === "nao_convertido"
              ? "border-farol-vermelho bg-farol-vermelho/10 text-farol-vermelho"
              : "hover:border-farol-vermelho/60"
          )}
        >
          ✗ Não convertido
        </button>
      </div>
      <input type="hidden" name="desfecho" value={desfecho} />

      {desfecho === "convertido" && (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="plano_id">Plano vendido *</Label>
            <select
              id="plano_id"
              name="plano_id"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Selecione…</option>
              {planos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="origem_cadastro">Origem de entrada *</Label>
            <select
              id="origem_cadastro"
              name="origem_cadastro"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Selecione…</option>
              {(Object.keys(ROTULO_ORIGEM) as CategoriaOrigem[]).map((o) => (
                <option key={o} value={o}>
                  {ROTULO_ORIGEM[o]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" name="cpf" defaultValue={cpf ?? ""} placeholder="p/ reconciliar" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" name="telefone" defaultValue={telefone ?? ""} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            CPF ou telefone é obrigatório — é o que cruza este ticket com o contrato no SGP (5.17).
          </p>
        </div>
      )}

      {desfecho === "nao_convertido" && (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="motivo_id">Motivo *</Label>
            <select
              id="motivo_id"
              name="motivo_id"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Selecione…</option>
              {motivos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="observacao">Observação (opcional)</Label>
            <Input id="observacao" name="observacao" placeholder="detalhe do motivo" />
          </div>
        </div>
      )}

      <Erro estado={estado} />
      {desfecho !== "" && <BotaoEnviar rotulo="Fechar ticket" />}
      {desfecho === "" && (
        <p className="text-xs text-muted-foreground">
          Selecione o desfecho — não existe fechar sem desfecho (PRD 3.9).
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
export type PlanoOpcao = { id: string; nome: string; velocidade: string | null; valor_referencia: number | null };

export function FormularioProposta({ ticketId, planos }: { ticketId: string; planos: PlanoOpcao[] }) {
  const [estado, acao] = useFormState(adicionarProposta, inicial);
  const [planoId, setPlanoId] = useState("");
  const [valor, setValor] = useState("");

  function aoTrocarPlano(id: string) {
    setPlanoId(id);
    const p = planos.find((x) => x.id === id);
    // sugere o preço de tabela; a vendedora ainda pode editar (valor negociado)
    if (p?.valor_referencia) setValor(String(p.valor_referencia));
  }

  return (
    <form
      action={acao}
      className="space-y-2.5"
      key={estado.ok ? Date.now() : "proposta"} // limpa após salvar
    >
      <input type="hidden" name="ticket_id" value={ticketId} />
      <div className="space-y-1.5">
        <Label htmlFor="plano_id">Plano / produto</Label>
        <select
          id="plano_id"
          name="plano_id"
          value={planoId}
          onChange={(e) => aoTrocarPlano(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Selecione um plano…</option>
          {planos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
              {p.velocidade ? ` · ${p.velocidade}` : ""}
              {p.valor_referencia ? ` — ${formatarMoeda(p.valor_referencia)}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="valor">Valor mensal (R$) *</Label>
          <Input
            id="valor"
            name="valor"
            type="number"
            step="0.01"
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="observacao">Observação</Label>
          <Input id="observacao" name="observacao" placeholder="condição, desconto…" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <BotaoEnviar rotulo="Registrar proposta" />
        <span className="text-xs text-muted-foreground">
          O valor da última proposta aparece no card do funil.
        </span>
      </div>
      <Erro estado={estado} />
    </form>
  );
}

// ---------------------------------------------------------------------------
export function FormularioNota({ ticketId }: { ticketId: string }) {
  const [estado, acao] = useFormState(adicionarNota, inicial);
  return (
    <form
      action={acao}
      className="flex gap-2"
      key={estado.ok ? Date.now() : "nota"} // limpa o campo após salvar
    >
      <input type="hidden" name="ticket_id" value={ticketId} />
      <Input name="texto" placeholder="Registrar tratativa / nota…" className="flex-1" />
      <BotaoEnviar rotulo="Anotar" />
      <Erro estado={estado} />
    </form>
  );
}

export function FormularioFollowup({ ticketId, atual }: { ticketId: string; atual: string | null }) {
  const [estado, acao] = useFormState(agendarFollowup, inicial);
  return (
    <form action={acao} className="flex items-center gap-2">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <Input
        type="date"
        name="followup_em"
        defaultValue={atual ? atual.slice(0, 10) : ""}
        className="w-40"
      />
      <BotaoEnviar rotulo="Agendar retorno" />
      <Erro estado={estado} />
    </form>
  );
}

export function FormularioReatribuir({
  ticketId,
  vendedoras,
  atualId,
}: {
  ticketId: string;
  vendedoras: { id: string; nome: string }[];
  atualId: string | null;
}) {
  const [estado, acao] = useFormState(reatribuirTicket, inicial);
  return (
    <form action={acao} className="flex items-center gap-2">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <select
        name="vendedor_id"
        defaultValue={atualId ?? ""}
        className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">Selecione a vendedora…</option>
        {vendedoras.map((v) => (
          <option key={v.id} value={v.id}>
            {v.nome}
          </option>
        ))}
      </select>
      <BotaoEnviar rotulo="Reatribuir" />
      <Erro estado={estado} />
    </form>
  );
}

export function BotaoReabrir({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [aguardando, setAguardando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={aguardando}
        onClick={async () => {
          setAguardando(true);
          const r = await reabrirTicket(ticketId);
          setErro(r.erro ?? null);
          setAguardando(false);
          router.refresh();
        }}
      >
        {aguardando ? "Reabrindo…" : "Reabrir ticket"}
      </Button>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}

/** Exclusão administrativa — só aparece para o Administrador (gestor). */
export function BotaoExcluir({ ticketId, cliente }: { ticketId: string; cliente: string }) {
  const [aguardando, setAguardando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={aguardando}
        onClick={async () => {
          if (
            !confirm(
              `Excluir definitivamente o ticket de "${cliente}"? Esta ação é permanente e apaga o histórico do ticket.`
            )
          )
            return;
          setAguardando(true);
          const r = await excluirTicket(ticketId);
          // sucesso redireciona para /crm; só chega aqui se deu erro
          setErro(r?.erro ?? "Falha ao excluir.");
          setAguardando(false);
        }}
      >
        {aguardando ? "Excluindo…" : "🗑 Excluir ticket (admin)"}
      </Button>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}


/**
 * Registrar tratativa — o diário do ticket (essencial no corporativo):
 * "liguei, pediu retorno" vira nota datada no histórico e, se houver retorno
 * combinado, agenda o lembrete automaticamente.
 */
export function FormularioTratativa({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [comRetorno, setComRetorno] = useState(false);
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const [aguardando, setAguardando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function salvar() {
    setAguardando(true);
    setOk(false);
    const fd = new FormData();
    fd.set("ticket_id", ticketId);
    fd.set("texto", texto);
    if (comRetorno) {
      fd.set("retorno_data", data);
      fd.set("retorno_hora", hora);
    }
    const r = await registrarTratativa({}, fd);
    setErro(r.erro ?? null);
    setAguardando(false);
    if (!r.erro) {
      setTexto(""); setData(""); setHora(""); setComRetorno(false); setOk(true);
      setTimeout(() => setOk(false), 4000);
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="O que foi conversado? (ex.: liguei, cliente pediu retorno na sexta · reunião feita, vai avaliar a proposta)"
        rows={2}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={comRetorno}
          onChange={(e) => setComRetorno(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        Combinar retorno (agenda lembrete 🔔)
      </label>
      {comRetorno && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm" />
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm" />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={salvar} disabled={aguardando}>
          {aguardando ? "Registrando…" : "📞 Registrar tratativa"}
        </Button>
        {ok && <span className="text-xs font-medium text-farol-verde">registrada ✓</span>}
        {erro && <span className="text-xs text-destructive">{erro}</span>}
      </div>
    </div>
  );
}
