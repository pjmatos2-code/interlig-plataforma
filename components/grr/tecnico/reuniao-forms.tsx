"use client";

import { useFormState, useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import {
  criarReuniaoTecnicoAcao,
  encerrarReuniaoTecnicoAcao,
  incluirCompromissoTecnicoAcao,
  mudarCompromissoTecnicoAcao,
  salvarAtaTecnicoAcao,
  type EstadoReuniaoTecnico,
} from "@/app/(app)/grr/tecnico/reunioes/acoes";
import { ROTULO_SITUACAO, type Participante, type SituacaoCompromisso } from "@/lib/grr/reunioes";

const campo = "h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm focus:border-interlig-ceu focus:outline-none";
const area = "min-h-[5rem] w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-interlig-ceu focus:outline-none";
const rotulo = "grid gap-1 text-xs font-medium text-muted-foreground";

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
function Aviso({ estado }: { estado: EstadoReuniaoTecnico }) {
  if (estado.erro) return <p className="text-sm font-medium text-red-700" role="alert">{estado.erro}</p>;
  if (estado.ok) return <p className="text-sm font-medium text-green-700" role="status">{estado.ok}</p>;
  return null;
}

export function FormNovaReuniaoTecnico({ data, semana, recortes }: { data: string; semana: string; recortes: { valor: string; rotulo: string }[] }) {
  const [estado, acao] = useFormState(criarReuniaoTecnicoAcao, {});
  return (
    <form action={acao} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      <label className={rotulo}>
        Data da reunião
        <input type="date" name="data" defaultValue={data} required className={campo} />
      </label>
      <label className={rotulo}>
        Semana analisada (qualquer dia dela)
        <input type="date" name="semana" defaultValue={semana} required className={campo} />
      </label>
      <label className={rotulo}>
        Recorte
        <select name="recorte" defaultValue="empresa" className={campo}>
          {recortes.map((r) => (
            <option key={r.valor} value={r.valor}>{r.rotulo}</option>
          ))}
        </select>
      </label>
      <Enviar texto="Abrir a reunião" enviando="Abrindo…" />
      <div className="sm:col-span-2 lg:col-span-4"><Aviso estado={estado} /></div>
    </form>
  );
}

export function FormAtaTecnico({ id, tecnicos, participantes, observacoes, boasPraticas }: { id: string; tecnicos: { id: string; nome: string; unidade: string }[]; participantes: Participante[]; observacoes: string; boasPraticas: string }) {
  const [estado, acao] = useFormState(salvarAtaTecnicoAcao, {});
  const marcado = new Set(participantes.map((p) => p.nome));
  const coord = participantes.filter((p) => p.papel === "coordenacao");
  const convidados = participantes.filter((p) => p.papel === "convidado").map((p) => p.nome).join(", ");
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Participantes</legend>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {coord.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="participante" value={`${p.id}|${p.nome}|coordenacao`} defaultChecked className="h-4 w-4" /> {p.nome} <span className="text-xs text-muted-foreground">coordenação</span>
            </label>
          ))}
          {tecnicos.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="participante" value={`${t.id}|${t.nome}|tecnico`} defaultChecked={marcado.has(t.nome)} className="h-4 w-4" /> {t.nome} <span className="text-xs text-muted-foreground">{t.unidade}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className={rotulo}>
        Convidados (separe por vírgula)
        <input name="convidados" defaultValue={convidados} maxLength={500} className={campo} />
      </label>
      <label className={rotulo}>
        O que foi discutido (desvios, causas e combinados)
        <textarea name="observacoes" defaultValue={observacoes} className={area} />
      </label>
      <label className={rotulo}>
        Boas práticas da semana
        <textarea name="boas_praticas" defaultValue={boasPraticas} className={area} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Enviar texto="Salvar a ata" enviando="Salvando…" />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function FormCompromissoTecnico({ id, responsaveis }: { id: string; responsaveis: string[] }) {
  const [estado, acao] = useFormState(incluirCompromissoTecnicoAcao, {});
  return (
    <form action={acao} className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_10rem_auto] sm:items-end">
      <input type="hidden" name="id" value={id} />
      <label className={rotulo}>
        Compromisso
        <input name="descricao" required maxLength={500} placeholder="Ex.: zerar as OS para baixar de Altamira até sexta" className={campo} />
      </label>
      <label className={rotulo}>
        Responsável
        <input name="responsavel" list="responsaveis-tecnico" maxLength={120} className={campo} />
        <datalist id="responsaveis-tecnico">
          {responsaveis.map((r) => <option key={r} value={r} />)}
        </datalist>
      </label>
      <label className={rotulo}>
        Prazo
        <input type="date" name="prazo" className={campo} />
      </label>
      <Enviar texto="Incluir" enviando="Incluindo…" />
      <div className="sm:col-span-4"><Aviso estado={estado} /></div>
    </form>
  );
}

export function SituacaoCompromissoTecnico({ compromisso, reuniao, situacao }: { compromisso: string; reuniao: string; situacao: SituacaoCompromisso }) {
  const [estado, acao] = useFormState(mudarCompromissoTecnicoAcao, {});
  return (
    <form action={acao} className="flex items-center gap-2">
      <input type="hidden" name="compromisso" value={compromisso} />
      <input type="hidden" name="reuniao" value={reuniao} />
      <label className="sr-only" htmlFor={`sit-${compromisso}`}>Situação</label>
      <select id={`sit-${compromisso}`} name="situacao" defaultValue={situacao} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="h-8 rounded-md border bg-background px-2 text-xs">
        {(Object.keys(ROTULO_SITUACAO) as SituacaoCompromisso[]).map((s) => (
          <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>
        ))}
      </select>
      {estado.erro && <span className="text-xs text-red-700" role="alert">{estado.erro}</span>}
    </form>
  );
}

export function FormEncerrarTecnico({ id }: { id: string }) {
  const [estado, acao] = useFormState(encerrarReuniaoTecnicoAcao, {});
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        if (!window.confirm("Encerrar a reunião? A ata e os números ficam guardados e não mudam mais.")) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="hidden" name="id" value={id} />
      <Enviar texto="Encerrar a reunião" enviando="Encerrando…" />
      <Aviso estado={estado} />
    </form>
  );
}
