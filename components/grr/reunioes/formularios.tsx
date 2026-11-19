"use client";

import { useFormState, useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import {
  aprovacaoCompromissoAcao,
  criarReuniaoAcao,
  encerrarReuniaoEquipeAcao,
  incluirCompromissoAcao,
  registrarCorrecaoAcao,
  salvarReuniaoAcao,
  situacaoCompromissoAcao,
  type EstadoReuniao,
} from "@/app/(app)/grr/reunioes/acoes";
import { ROTULO_SITUACAO, type Participante, type SituacaoCompromisso } from "@/lib/grr/reunioes";

const campo = "h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm focus:border-interlig-ceu focus:outline-none";
const area = "min-h-[5rem] w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-interlig-ceu focus:outline-none";
const rotulo = "block text-xs font-medium text-muted-foreground";

function Enviar({ texto, enviando, secundario = false, className }: { texto: string; enviando: string; secundario?: boolean; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:opacity-60",
        secundario ? "border bg-background hover:border-interlig-ceu" : "bg-interlig-azul text-white hover:bg-interlig-azul/90",
        className
      )}
    >
      {pending ? enviando : texto}
    </button>
  );
}

function Aviso({ estado }: { estado: EstadoReuniao }) {
  if (estado.erro) return <p className="text-sm font-medium text-red-700" role="alert">{estado.erro}</p>;
  if (estado.ok) return <p className="text-sm font-medium text-green-700" role="status">{estado.ok}</p>;
  return null;
}

export function FormNovaReuniao({ recortes, hoje, semanas }: { recortes: { valor: string; rotulo: string }[]; hoje: string; semanas: { valor: string; rotulo: string }[] }) {
  const [estado, acao] = useFormState<EstadoReuniao, FormData>(criarReuniaoAcao, {});
  return (
    <form action={acao} className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-end">
      <label className={rotulo}>
        Equipe ou unidade
        <select name="recorte" className={cn(campo, "mt-1")} required>
          {recortes.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.rotulo}
            </option>
          ))}
        </select>
      </label>
      <label className={rotulo}>
        Data da reunião
        <input type="date" name="data" defaultValue={hoje} className={cn(campo, "mt-1")} required />
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

export function FormPreparacao({
  id,
  data,
  sugeridos,
  participantes,
  observacoes,
  boasPraticas,
  podeEditar,
}: {
  id: string;
  data: string;
  sugeridos: Participante[];
  participantes: Participante[];
  observacoes: string;
  boasPraticas: string;
  podeEditar: boolean;
}) {
  const [estado, acao] = useFormState<EstadoReuniao, FormData>(salvarReuniaoAcao, {});
  const marcados = new Set(participantes.map((p) => p.id));
  const convidados = participantes.filter((p) => p.papel === "convidado").map((p) => p.nome).join(", ");
  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <fieldset disabled={!podeEditar} className="space-y-4">
        <label className={cn(rotulo, "max-w-xs")}>
          Data da reunião
          <input type="date" name="data" defaultValue={data} className={cn(campo, "mt-1")} />
        </label>
        <div>
          <p className={rotulo}>Participantes</p>
          <div className="mt-1 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {sugeridos.map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                <input type="checkbox" name="participante" value={p.id} defaultChecked={marcados.has(p.id)} className="h-4 w-4" />
                <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                {p.papel === "coordenacao" && <span className="text-xs text-muted-foreground">coordenação</span>}
              </label>
            ))}
          </div>
          <label className={cn(rotulo, "mt-2")}>
            Convidados (nomes separados por vírgula)
            <input name="convidados" defaultValue={convidados} className={cn(campo, "mt-1")} placeholder="Ex.: Paulo" />
          </label>
        </div>
        <label className={rotulo}>
          Observações
          <textarea name="observacoes" defaultValue={observacoes} className={cn(area, "mt-1")} placeholder="O que se discutiu sobre a semana." />
        </label>
        <label className={rotulo}>
          Boas práticas
          <textarea name="boas_praticas" defaultValue={boasPraticas} className={cn(area, "mt-1")} placeholder="O que funcionou e vale repetir." />
        </label>
      </fieldset>
      {podeEditar && (
        <div className="flex flex-wrap items-center gap-3">
          <Enviar texto="Salvar" enviando="Salvando…" />
          <Aviso estado={estado} />
        </div>
      )}
    </form>
  );
}

export function FormCompromisso({ id, agentes }: { id: string; agentes: { id: string; nome: string }[] }) {
  const [estado, acao] = useFormState<EstadoReuniao, FormData>(incluirCompromissoAcao, {});
  return (
    <form action={acao} className="space-y-3 rounded-xl border border-dashed p-3">
      <input type="hidden" name="id" value={id} />
      <label className={rotulo}>
        Compromisso
        <input name="descricao" required maxLength={500} className={cn(campo, "mt-1")} placeholder="Ex.: retornar os 12 leads parados até quarta" />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={rotulo}>
          Quem assume
          <select name="agente" className={cn(campo, "mt-1")}>
            <option value="">Equipe</option>
            {agentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          Prazo
          <input type="date" name="prazo" className={cn(campo, "mt-1")} />
        </label>
        <label className={rotulo}>
          Tipo
          <select name="tipo" className={cn(campo, "mt-1")}>
            <option value="operacional">Operacional (autonomia da coordenação)</option>
            <option value="gerencial">Gerencial (precisa da diretoria)</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">Gerencial: investimento, mudança de política ou decisão fora da autonomia da coordenação. Fica aguardando a diretoria.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Enviar texto="Incluir compromisso" enviando="Incluindo…" />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

/** troca a situação ao escolher (sem botão) */
export function SeletorSituacao({ id, compromisso, situacao, podeEditar }: { id: string; compromisso: string; situacao: SituacaoCompromisso; podeEditar: boolean }) {
  const [estado, acao] = useFormState<EstadoReuniao, FormData>(situacaoCompromissoAcao, {});
  return (
    <form action={acao} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="compromisso" value={compromisso} />
      <select
        name="situacao"
        defaultValue={situacao}
        disabled={!podeEditar}
        aria-label="Situação do compromisso"
        className="h-9 rounded-lg border bg-background px-2 text-sm"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {(Object.keys(ROTULO_SITUACAO) as SituacaoCompromisso[]).map((s) => (
          <option key={s} value={s}>
            {ROTULO_SITUACAO[s]}
          </option>
        ))}
      </select>
      {estado.erro && <span className="text-xs text-red-700">{estado.erro}</span>}
    </form>
  );
}

export function BotoesAprovacao({ id, compromisso }: { id: string; compromisso: string }) {
  const [estado, acao] = useFormState<EstadoReuniao, FormData>(aprovacaoCompromissoAcao, {});
  const botao = "h-8 rounded-lg border px-2.5 text-xs font-medium hover:border-interlig-ceu";
  return (
    <form action={acao} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="compromisso" value={compromisso} />
      <button name="aprovacao" value="aprovado" className={cn(botao, "border-farol-verde/40 bg-farol-verde/10")}>Aprovar</button>
      <button name="aprovacao" value="ajuste" className={botao}>Pedir ajuste</button>
      <button name="aprovacao" value="rejeitado" className={cn(botao, "border-farol-vermelho/30")}>Rejeitar</button>
      {estado.erro && <span className="text-xs text-red-700">{estado.erro}</span>}
    </form>
  );
}

export function FormEncerrar({ id }: { id: string }) {
  const [estado, acao] = useFormState<EstadoReuniao, FormData>(encerrarReuniaoEquipeAcao, {});
  return (
    <form
      action={acao}
      className="space-y-2"
      onSubmit={(e) => {
        if (!confirm("Encerrar a reunião? Os indicadores, os participantes e os compromissos ficam guardados e não mudam mais.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Enviar texto="Encerrar reunião" enviando="Guardando os números…" />
      <Aviso estado={estado} />
    </form>
  );
}

export function FormCorrecao({ id }: { id: string }) {
  const [estado, acao] = useFormState<EstadoReuniao, FormData>(registrarCorrecaoAcao, {});
  return (
    <form action={acao} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <textarea name="texto" required maxLength={2000} className={area} placeholder="O que estava errado e qual é o correto. O registro original não muda." />
      <div className="flex flex-wrap items-center gap-3">
        <Enviar texto="Registrar correção" enviando="Registrando…" secundario />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}
