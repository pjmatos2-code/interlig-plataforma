"use client";

import { useFormState, useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import {
  corrigirReuniaoDiretoriaAcao,
  criarReuniaoDiretoriaAcao,
  encerrarReuniaoDiretoriaAcao,
  incluirDecisaoAcao,
  removerDecisaoAcao,
  salvarPreparacaoAcao,
  type EstadoDiretoria,
} from "@/app/(app)/grr/reunioes/diretoria-acoes";
import type { Decisao, ItemPauta, Participante } from "@/lib/grr/reunioes";

const campo = "h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm focus:border-interlig-ceu focus:outline-none";
const area = "min-h-[4.5rem] w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-interlig-ceu focus:outline-none";
const rotulo = "block text-xs font-medium text-muted-foreground";

function Enviar({ texto, enviando, secundario = false }: { texto: string; enviando: string; secundario?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn("inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:opacity-60", secundario ? "border bg-background hover:border-interlig-ceu" : "bg-interlig-azul text-white hover:bg-interlig-azul/90")}
    >
      {pending ? enviando : texto}
    </button>
  );
}
function Aviso({ estado }: { estado: EstadoDiretoria }) {
  if (estado.erro) return <p className="text-sm font-medium text-red-700" role="alert">{estado.erro}</p>;
  if (estado.ok) return <p className="text-sm font-medium text-green-700" role="status">{estado.ok}</p>;
  return null;
}

export function FormNovaReuniaoDiretoria({ hoje, semanas, unidades }: { hoje: string; semanas: { valor: string; rotulo: string }[]; unidades: { id: string; nome: string }[] }) {
  const [estado, acao] = useFormState<EstadoDiretoria, FormData>(criarReuniaoDiretoriaAcao, {});
  return (
    <form action={acao} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] sm:items-end">
      <label className={rotulo}>
        Abrangência
        <select name="recorte" className={cn(campo, "mt-1")}>
          <option value="empresa">Empresa</option>
          {unidades.map((u) => (
            <option key={u.id} value={`unidade:${u.id}`}>
              Unidade {u.nome}
            </option>
          ))}
        </select>
      </label>
      <label className={rotulo}>
        Data da reunião
        <input type="date" name="data" defaultValue={hoje} required className={cn(campo, "mt-1")} />
      </label>
      <label className={rotulo}>
        Período de referência
        <select name="periodo" className={cn(campo, "mt-1")}>
          {semanas.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </select>
      </label>
      <Enviar texto="Criar reunião" enviando="Criando…" />
      <div className="sm:col-span-4">
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function FormParticipantesDiretoria({
  id,
  data,
  possiveis,
  participantes,
}: {
  id: string;
  data: string;
  possiveis: { id: string; nome: string; perfil: string }[];
  participantes: Participante[];
}) {
  const [estado, acao] = useFormState<EstadoDiretoria, FormData>(salvarPreparacaoAcao, {});
  const marcados = new Set(participantes.map((p) => p.id));
  const convidados = participantes.filter((p) => p.papel === "convidado").map((p) => p.nome).join(", ");
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="participantes_enviados" value="1" />
      <label className={cn(rotulo, "max-w-xs")}>
        Data da reunião
        <input type="date" name="data" defaultValue={data} className={cn(campo, "mt-1")} />
      </label>
      <div>
        <p className={rotulo}>Participantes (diretoria e coordenação)</p>
        <div className="mt-1 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {possiveis.map((p) => (
            <label key={p.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
              <input type="checkbox" name="participante" value={p.id} defaultChecked={marcados.has(p.id)} className="h-4 w-4" />
              <span className="min-w-0 flex-1 truncate">{p.nome}</span>
              <span className="text-xs text-muted-foreground">{p.perfil === "supervisor" ? "coordenação" : "diretoria"}</span>
            </label>
          ))}
        </div>
      </div>
      <label className={rotulo}>
        Convidados (nomes separados por vírgula)
        <input name="convidados" defaultValue={convidados} className={cn(campo, "mt-1")} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Enviar texto="Salvar participantes" enviando="Salvando…" />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

/** anotação de um item da pauta */
export function FormNotaPauta({ id, item, valor }: { id: string; item: ItemPauta; valor: string }) {
  const [estado, acao] = useFormState<EstadoDiretoria, FormData>(salvarPreparacaoAcao, {});
  return (
    <form action={acao} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <textarea name={`pauta_${item}`} defaultValue={valor} className={area} placeholder="Anotações deste item da pauta." aria-label="Anotações do item da pauta" />
      <div className="flex flex-wrap items-center gap-3">
        <Enviar texto="Salvar anotação" enviando="Salvando…" secundario />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function FormDecisao({ id }: { id: string }) {
  const [estado, acao] = useFormState<EstadoDiretoria, FormData>(incluirDecisaoAcao, {});
  return (
    <form action={acao} className="space-y-2 rounded-xl border border-dashed p-3">
      <input type="hidden" name="id" value={id} />
      <label className={rotulo}>
        Decisão
        <input name="texto" required maxLength={600} className={cn(campo, "mt-1")} placeholder="O que foi decidido." />
      </label>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-end">
        <label className={rotulo}>
          Responsável
          <input name="responsavel" maxLength={80} className={cn(campo, "mt-1")} />
        </label>
        <label className={rotulo}>
          Prazo
          <input type="date" name="prazo" className={cn(campo, "mt-1")} />
        </label>
        <Enviar texto="Registrar decisão" enviando="Registrando…" />
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

export function ListaDecisoesEditavel({ id, decisoes }: { id: string; decisoes: Decisao[] }) {
  const [estado, acao] = useFormState<EstadoDiretoria, FormData>(removerDecisaoAcao, {});
  if (!decisoes.length) return null;
  return (
    <form action={acao} className="space-y-1.5">
      <input type="hidden" name="id" value={id} />
      <p className={rotulo}>Retirar uma decisão registrada por engano (só enquanto a reunião está aberta)</p>
      <div className="flex flex-wrap gap-1.5">
        {decisoes.map((d, i) => (
          <button key={d.id} name="decisao" value={d.id} className="h-8 rounded-lg border px-2.5 text-xs hover:border-farol-vermelho/50" title={d.texto}>
            Retirar a {i + 1}ª
          </button>
        ))}
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

export function FormEncerrarDiretoria({ id, grande = false }: { id: string; grande?: boolean }) {
  const [estado, acao] = useFormState<EstadoDiretoria, FormData>(encerrarReuniaoDiretoriaAcao, {});
  return (
    <form
      action={acao}
      className="space-y-2"
      onSubmit={(e) => {
        if (!confirm("Encerrar oficialmente a reunião? A semana é congelada (se ainda não estiver) e a ata não muda mais.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={cn("inline-flex items-center justify-center rounded-xl bg-interlig-azul px-5 font-semibold text-white hover:bg-interlig-azul/90", grande ? "h-12 text-base" : "h-10 text-sm")}>
        Encerrar reunião
      </button>
      <Aviso estado={estado} />
    </form>
  );
}

export function FormCorrecaoDiretoria({ id }: { id: string }) {
  const [estado, acao] = useFormState<EstadoDiretoria, FormData>(corrigirReuniaoDiretoriaAcao, {});
  return (
    <form action={acao} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <textarea name="texto" required maxLength={2000} className={area} placeholder="O que estava errado e qual é o correto. A ata original não muda." />
      <div className="flex flex-wrap items-center gap-3">
        <Enviar texto="Registrar correção" enviando="Registrando…" secundario />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}
