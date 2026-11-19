"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { congelarSemanaAcao, incluirMetaAcao, salvarIndicadorAcao, type EstadoGrr } from "@/app/(app)/grr/acoes";

const campo = "h-9 min-w-0 rounded-md border bg-background px-2 text-sm";
const botao = "h-9 rounded-md bg-interlig-azul px-3 text-sm font-medium text-white disabled:opacity-60";

function Enviar({ rotulo, enviando }: { rotulo: string; enviando: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={botao} disabled={pending}>
      {pending ? enviando : rotulo}
    </button>
  );
}

function Retorno({ estado }: { estado: EstadoGrr }) {
  if (estado.erro) return <p role="alert" className="text-xs font-medium text-farol-vermelho">{estado.erro}</p>;
  if (estado.ok) return <p role="status" className="text-xs font-medium text-farol-verde">{estado.ok}</p>;
  return null;
}

type FotoDaTela = { versao: number; congeladoEm: string; motivo: string | null } | null;

const dataHora = (iso: string) => {
  const d = new Date(Date.parse(iso) - 3 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)} às ${d.slice(11, 16)}`;
};

/** Faixa do topo do painel: diz se a semana está congelada e deixa a administração e a direção congelar. */
export function FaixaCongelamento({
  semanaInicio,
  disponivel,
  completa,
  foto,
  aoVivo,
  podeCongelar,
  linkVivo,
  linkFoto,
}: {
  semanaInicio: string;
  disponivel: boolean;
  completa: boolean;
  foto: FotoDaTela;
  aoVivo: boolean;
  podeCongelar: boolean;
  linkVivo: string;
  linkFoto: string;
}) {
  const [estado, acao] = useFormState(congelarSemanaAcao, {});
  if (!disponivel || !completa) return null;
  return (
    <div className="mb-4 space-y-2 rounded-xl border bg-card px-4 py-3 text-sm">
      {foto ? (
        <p>
          {aoVivo ? (
            <>
              Você está vendo os <strong>números de agora</strong>. A foto desta semana é a versão {foto.versao}, de {dataHora(foto.congeladoEm)}.{" "}
              <Link href={linkFoto} className="font-medium text-interlig-azul hover:underline">
                Voltar para a foto
              </Link>
            </>
          ) : (
            <>
              <strong>Resultados congelados</strong> em {dataHora(foto.congeladoEm)}, versão {foto.versao}.{foto.motivo ? ` Motivo: ${foto.motivo}.` : ""}{" "}
              <Link href={linkVivo} className="font-medium text-interlig-azul hover:underline">
                Ver os números de agora
              </Link>
            </>
          )}
        </p>
      ) : (
        <p>
          Semana completa <strong>ainda sem foto</strong>: os números abaixo são os de agora e podem mudar.
        </p>
      )}
      {podeCongelar && (
        <form action={acao} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="semana" value={semanaInicio} />
          {foto && (
            <input name="motivo" required minLength={5} maxLength={200} placeholder="Motivo para congelar de novo" aria-label="Motivo para congelar de novo" className={`${campo} flex-1 basis-56`} />
          )}
          <Enviar rotulo={foto ? "Congelar de novo" : "Congelar esta semana"} enviando="Congelando…" />
          <Retorno estado={estado} />
        </form>
      )}
    </div>
  );
}

/** Liga ou desliga o indicador e define o dono. */
export function FormIndicador({ chave, ativo, dono }: { chave: string; ativo: boolean; dono: string }) {
  const [estado, acao] = useFormState(salvarIndicadorAcao, {});
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="chave" value={chave} />
      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" name="ativo" defaultChecked={ativo} className="h-4 w-4" /> Aparece no painel
      </label>
      <input name="dono" defaultValue={dono} maxLength={80} placeholder="Dono do indicador" aria-label="Dono do indicador" className={`${campo} flex-1 basis-44`} />
      <Enviar rotulo="Salvar" enviando="Salvando…" />
      <Retorno estado={estado} />
    </form>
  );
}

/** Inclui uma meta com a faixa de atenção, a partir de uma semana, para um recorte. */
export function FormMeta({
  indicador,
  unidade,
  maiorEMelhor,
  escopos,
  semanaPadrao,
}: {
  indicador: string;
  unidade: "numero" | "moeda" | "percentual";
  maiorEMelhor: boolean;
  escopos: { valor: string; rotulo: string }[];
  semanaPadrao: string;
}) {
  const [estado, acao] = useFormState(incluirMetaAcao, {});
  const sufixo = unidade === "percentual" ? " (%)" : unidade === "moeda" ? " (R$)" : "";
  return (
    <form action={acao} className="space-y-2">
      <input type="hidden" name="indicador" value={indicador} />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Recorte
          <select name="escopo" defaultValue="empresa" className={campo}>
            {escopos.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Meta{sufixo}
          <input name="meta" inputMode="decimal" placeholder={unidade === "percentual" ? "35" : "0"} className={campo} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Atenção {maiorEMelhor ? "a partir de" : "até"}
          {sufixo}
          <input name="limite" inputMode="decimal" placeholder={unidade === "percentual" ? "28" : "0"} className={campo} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Vale a partir da semana de
          <input type="date" name="desde" defaultValue={semanaPadrao} required className={campo} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input name="observacao" maxLength={200} placeholder="Observação (opcional)" aria-label="Observação" className={`${campo} flex-1 basis-56`} />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="encerrar" className="h-4 w-4" /> Encerrar a meta
        </label>
        <Enviar rotulo="Incluir" enviando="Incluindo…" />
        <Retorno estado={estado} />
      </div>
      <p className="text-xs text-muted-foreground">
        {maiorEMelhor ? "Maior é melhor: verde a partir da meta, amarelo a partir do limite de atenção, vermelho abaixo dele." : "Menor é melhor: verde até a meta, amarelo até o limite de atenção, vermelho acima dele."}
      </p>
    </form>
  );
}
