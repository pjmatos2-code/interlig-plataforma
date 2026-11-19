"use client";

import { useFormState, useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { aprovacaoPlanoAcao, criarPlanoAcao, reenviarPlanoAcao, registrarNoPlanoAcao, salvarDiagnosticoAcao, situacaoPlanoAcao, type EstadoPlano } from "@/app/(app)/grr/planos/acoes";
import { ROTULO_SITUACAO_PLANO, type SituacaoPlano } from "@/lib/grr/planos";

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

function Aviso({ estado }: { estado: EstadoPlano }) {
  if (estado.erro) return <p className="text-sm font-medium text-red-700" role="alert">{estado.erro}</p>;
  if (estado.ok) return <p className="text-sm font-medium text-green-700" role="status">{estado.ok}</p>;
  return null;
}

type Contexto = { semana: string; recorte: string };

export function FormDiagnostico({ contexto, indicador, inicial }: { contexto: Contexto; indicador: string; inicial?: { causa: string; evidencias: string; providencias: string; solucao: string } }) {
  const [estado, acao] = useFormState<EstadoPlano, FormData>(salvarDiagnosticoAcao, {});
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="semana" value={contexto.semana} />
      <input type="hidden" name="recorte" value={contexto.recorte} />
      <input type="hidden" name="indicador" value={indicador} />
      <label className={rotulo}>
        1. Causa identificada
        <textarea name="causa" required defaultValue={inicial?.causa} className={cn(area, "mt-1")} placeholder="O que explica o desvio." />
      </label>
      <label className={rotulo}>
        2. Evidências
        <textarea name="evidencias" defaultValue={inicial?.evidencias} className={cn(area, "mt-1")} placeholder="Números, relatórios ou fatos que sustentam a causa. Sem evidência, a causa é hipótese." />
      </label>
      <label className={rotulo}>
        3. Providências já tomadas
        <textarea name="providencias" defaultValue={inicial?.providencias} className={cn(area, "mt-1")} />
      </label>
      <label className={rotulo}>
        4. Solução proposta
        <textarea name="solucao" defaultValue={inicial?.solucao} className={cn(area, "mt-1")} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Enviar texto={inicial ? "Salvar nova versão" : "Salvar diagnóstico"} enviando="Salvando…" />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function FormPlano({
  contexto,
  recortes,
  indicadores,
  indicador,
  diagnosticoId,
  responsaveis,
}: {
  /** recorte fixo (tela do indicador) ou escolha entre os permitidos */
  contexto: { semana: string; recorte?: string };
  recortes?: { valor: string; rotulo: string }[];
  indicadores?: { chave: string; nome: string }[];
  indicador?: string;
  diagnosticoId?: string | null;
  responsaveis: { id: string; nome: string }[];
}) {
  const [estado, acao] = useFormState<EstadoPlano, FormData>(criarPlanoAcao, {});
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="semana" value={contexto.semana} />
      {contexto.recorte != null && <input type="hidden" name="recorte" value={contexto.recorte} />}
      {indicador && <input type="hidden" name="indicador" value={indicador} />}
      {diagnosticoId && <input type="hidden" name="diagnostico_id" value={diagnosticoId} />}
      {(recortes || indicadores) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {recortes && (
            <label className={rotulo}>
              Recorte
              <select name="recorte" className={cn(campo, "mt-1")} required>
                {recortes.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.rotulo}
                  </option>
                ))}
              </select>
            </label>
          )}
          {indicadores && (
            <label className={rotulo}>
              Indicador
              <select name="indicador" className={cn(campo, "mt-1")}>
                <option value="">Outro problema (descrever)</option>
                {indicadores.map((i) => (
                  <option key={i.chave} value={i.chave}>
                    {i.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {indicadores && (
        <label className={rotulo}>
          Problema (quando não for um indicador)
          <input name="problema" maxLength={300} className={cn(campo, "mt-1")} />
        </label>
      )}
      <label className={rotulo}>
        Ação
        <textarea name="descricao" required maxLength={600} className={cn(area, "mt-1")} placeholder="O que será feito." />
      </label>
      <label className={rotulo}>
        Resultado esperado
        <input name="resultado" maxLength={600} className={cn(campo, "mt-1")} placeholder="Ex.: conversão por safra acima de 40% em duas semanas" />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={rotulo}>
          Responsável principal
          <select name="responsavel_id" className={cn(campo, "mt-1")}>
            <option value="">Outra pessoa (escrever o nome)</option>
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          Nome (se for outra pessoa)
          <input name="responsavel_nome" maxLength={80} className={cn(campo, "mt-1")} />
        </label>
        <label className={rotulo}>
          Prazo
          <input type="date" name="prazo" className={cn(campo, "mt-1")} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Enviar texto="Propor plano" enviando="Enviando…" />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function SeletorSituacaoPlano({ id, atual, permitidas }: { id: string; atual: SituacaoPlano; permitidas: SituacaoPlano[] }) {
  const [estado, acao] = useFormState<EstadoPlano, FormData>(situacaoPlanoAcao, {});
  const opcoes = [atual, ...permitidas.filter((s) => s !== atual)];
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select
        name="situacao"
        defaultValue={atual}
        disabled={permitidas.length === 0}
        aria-label="Situação do plano"
        className="h-10 rounded-lg border bg-background px-3 text-sm"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {opcoes.map((s) => (
          <option key={s} value={s}>
            {ROTULO_SITUACAO_PLANO[s]}
          </option>
        ))}
      </select>
      <Aviso estado={estado} />
    </form>
  );
}

export function FormAprovacaoPlano({ id, compacto = false, reuniaoId }: { id: string; compacto?: boolean; reuniaoId?: string }) {
  const [estado, acao] = useFormState<EstadoPlano, FormData>(aprovacaoPlanoAcao, {});
  const botao = "h-9 rounded-lg border px-3 text-sm font-medium hover:border-interlig-ceu";
  return (
    <form action={acao} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      {reuniaoId && <input type="hidden" name="reuniao" value={reuniaoId} />}
      <input name="justificativa" maxLength={1000} className={cn(campo, compacto && "h-9")} placeholder="Justificativa (obrigatória para ajuste ou rejeição)" />
      <div className="flex flex-wrap gap-2">
        <button name="aprovacao" value="aprovado" className={cn(botao, "border-farol-verde/40 bg-farol-verde/10")}>Aprovar</button>
        <button name="aprovacao" value="ajuste" className={botao}>Pedir ajuste</button>
        <button name="aprovacao" value="rejeitado" className={cn(botao, "border-farol-vermelho/30")}>Rejeitar</button>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

export function FormReenviarPlano({ id, descricao, resultado, prazo }: { id: string; descricao: string; resultado: string; prazo: string }) {
  const [estado, acao] = useFormState<EstadoPlano, FormData>(reenviarPlanoAcao, {});
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className={rotulo}>
        Ação
        <textarea name="descricao" required maxLength={600} defaultValue={descricao} className={cn(area, "mt-1")} />
      </label>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <label className={rotulo}>
          Resultado esperado
          <input name="resultado" maxLength={600} defaultValue={resultado} className={cn(campo, "mt-1")} />
        </label>
        <label className={rotulo}>
          Prazo
          <input type="date" name="prazo" defaultValue={prazo} className={cn(campo, "mt-1")} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Enviar texto="Reenviar à diretoria" enviando="Enviando…" />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function FormRegistroPlano({ id }: { id: string }) {
  const [estado, acao] = useFormState<EstadoPlano, FormData>(registrarNoPlanoAcao, {});
  return (
    <form action={acao} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <textarea name="texto" required maxLength={2000} className={area} placeholder="Evidência de execução (o que foi feito, link, número) ou comentário." />
      <div className="flex flex-wrap items-center gap-2">
        <select name="tipo" className="h-10 rounded-lg border bg-background px-3 text-sm" aria-label="Tipo de registro">
          <option value="evidencia">Evidência</option>
          <option value="comentario">Comentário</option>
        </select>
        <Enviar texto="Registrar" enviando="Registrando…" secundario />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}
