"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import {
  salvarSgp,
  testarSgp,
  executarDescobertaSgp,
  limparAmostras,
  salvarSzchat,
  gerarSegredoWebhook,
  dispararEventoTeste,
  testarApiSzchat,
  type EstadoIntegracao,
  type ResultadoRota,
} from "./acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const inicial: EstadoIntegracao = {};

function BotaoSalvar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar configuração"}
    </Button>
  );
}

function Mensagem({ estado }: { estado: EstadoIntegracao }) {
  if (estado.erro)
    return <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{estado.erro}</p>;
  if (estado.ok)
    return (
      <p className="rounded-md bg-farol-verde/10 px-3 py-2 text-sm text-farol-verde">
        {estado.mensagem ?? "Salvo."}
      </p>
    );
  return null;
}

function BotaoAcao({
  rotulo,
  rotuloAguardando,
  acao,
  variante = "outline",
  aoTerminar,
}: {
  rotulo: string;
  rotuloAguardando: string;
  acao: () => Promise<EstadoIntegracao>;
  variante?: "outline" | "default";
  aoTerminar?: (r: EstadoIntegracao) => void;
}) {
  const router = useRouter();
  const [aguardando, setAguardando] = useState(false);
  const [estado, setEstado] = useState<EstadoIntegracao>({});
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={variante}
        disabled={aguardando}
        onClick={async () => {
          setAguardando(true);
          const r = await acao();
          setEstado(r);
          aoTerminar?.(r);
          setAguardando(false);
          router.refresh();
        }}
      >
        {aguardando ? rotuloAguardando : rotulo}
      </Button>
      <Mensagem estado={estado} />
    </div>
  );
}

// ---------------------------------------------------------------------------
export function PainelSgp({
  configurado,
}: {
  configurado: { base_url: string | null; token: string | null; app: string | null; modo: string };
}) {
  const [estado, acao] = useFormState(salvarSgp, inicial);
  const [rotas, setRotas] = useState<ResultadoRota[] | null>(null);
  const [erroTeste, setErroTeste] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-5">
      <form action={acao} className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor="sgp_url">Endereço do SGP (o mesmo do navegador)</Label>
          <Input
            id="sgp_url"
            name="base_url"
            placeholder={configurado.base_url ?? "https://interlig.sgp.net.br"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sgp_token">
            Token {configurado.token && <Badge variant="verde">configurado {configurado.token}</Badge>}
          </Label>
          <Input
            id="sgp_token"
            name="token"
            type="password"
            placeholder={configurado.token ? "manter o atual (deixe vazio)" : "token de consulta"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sgp_app">
            App {configurado.app && <Badge variant="verde">configurado</Badge>}
          </Label>
          <Input
            id="sgp_app"
            name="app"
            placeholder={configurado.app ?? "nome do app do token"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sgp_modo">Fonte dos dados</Label>
          <select
            id="sgp_modo"
            name="modo"
            defaultValue={configurado.modo}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="mock">Demonstração (dados fictícios)</option>
            <option value="real">Real — API do SGP</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <BotaoSalvar />
        </div>
        <div className="lg:col-span-2">
          <Mensagem estado={estado} />
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={testando}
          onClick={async () => {
            setTestando(true);
            setErroTeste(null);
            const r = await testarSgp();
            setRotas(r.resultados ?? null);
            setErroTeste(r.erro ?? null);
            setTestando(false);
          }}
        >
          {testando ? "Testando rotas…" : "Testar conexão"}
        </Button>
        <BotaoAcao
          rotulo="Executar descoberta (Fase 0)"
          rotuloAguardando="Coletando amostras…"
          acao={executarDescobertaSgp}
        />
        <BotaoAcao
          rotulo="Limpar amostras"
          rotuloAguardando="Limpando…"
          acao={() => limparAmostras("sgp")}
        />
      </div>
      {erroTeste && <p className="text-sm text-destructive">{erroTeste}</p>}
      {rotas && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 font-medium">Rota</th>
                <th className="px-3 py-2 font-medium">HTTP</th>
                <th className="px-3 py-2 font-medium">Resumo</th>
              </tr>
            </thead>
            <tbody>
              {rotas.map((r) => (
                <tr key={r.rota} className="border-b last:border-0">
                  <td className="px-3 py-1.5 font-mono text-xs">{r.rota}</td>
                  <td
                    className={cn(
                      "px-3 py-1.5 font-semibold tabular-nums",
                      r.status === 200 ? "text-farol-verde" : "text-farol-vermelho"
                    )}
                  >
                    {r.status}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.resumo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function PainelSzchat({
  configurado,
  urlWebhook,
}: {
  configurado: { base_url: string | null; api_token: string | null; temSegredo: boolean };
  urlWebhook: string;
}) {
  const [estado, acao] = useFormState(salvarSzchat, inicial);
  const [segredoNovo, setSegredoNovo] = useState<string | null>(null);

  const corpoModelo = `{
  "evento_id": "@{{PROTOCOLO}}",
  "tipo": "transferencia_equipe",
  "equipe": "Comercial Altamira",
  "conversa_id": "@{{PROTOCOLO}}",
  "contato": {
    "nome": "@{{NOME_CONTATO}}",
    "telefone": "@{{TELEFONE_CONTATO}}"
  }
}`;

  return (
    <div className="space-y-6">
      {/* Receptor (webhook) */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="mb-2 text-sm font-semibold">
          1 · Receptor de tickets (usar no componente REST do Fluxo)
        </p>
        <div className="grid gap-2 text-sm">
          <p>
            <span className="text-muted-foreground">URL (método POST):</span>{" "}
            <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">{urlWebhook}</code>
          </p>
          <p>
            <span className="text-muted-foreground">Cabeçalhos:</span>{" "}
            <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
              Content-Type: application/json
            </code>{" "}
            <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
              x-szchat-secret: (segredo abaixo)
            </code>
          </p>
          <div>
            <p className="mb-1 text-muted-foreground">
              Corpo (JSON) — substitua <code>@{"{{...}}"}</code> pelas variáveis reais do fluxo;
              troque &quot;equipe&quot; pelo nome exato da equipe de cada fluxo:
            </p>
            <pre className="overflow-x-auto rounded-md border bg-background p-3 font-mono text-xs">{corpoModelo}</pre>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <BotaoAcao
            rotulo={configurado.temSegredo ? "Trocar segredo do webhook" : "Gerar segredo do webhook"}
            rotuloAguardando="Gerando…"
            acao={async () => {
              const r = await gerarSegredoWebhook();
              if (r.segredo) setSegredoNovo(r.segredo);
              return r;
            }}
          />
          {segredoNovo && (
            <p className="rounded-md border border-farol-amarelo/60 bg-farol-amarelo/10 px-3 py-2 font-mono text-xs">
              {segredoNovo}
              <span className="mt-1 block font-sans text-muted-foreground">
                Copie AGORA e cole no cabeçalho x-szchat-secret do SZ Chat — não será exibido de novo.
                Trocar o segredo invalida o anterior.
              </span>
            </p>
          )}
          {configurado.temSegredo && !segredoNovo && (
            <p className="text-xs text-muted-foreground">
              Segredo já configurado. As equipes que geram ticket e o mapeamento de atendentes
              ficam na página Administração.
            </p>
          )}
          <BotaoAcao
            rotulo="Disparar evento de teste"
            rotuloAguardando="Disparando…"
            acao={dispararEventoTeste}
          />
        </div>
      </div>

      {/* API */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="mb-2 text-sm font-semibold">
          2 · API do SZ Chat (transcrições e agente de follow-up)
        </p>
        <form action={acao} className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sz_url">Endereço do SZ Chat</Label>
            <Input id="sz_url" name="base_url" placeholder={configurado.base_url ?? "https://interlig.sz.chat"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sz_token">
              Token da API (Integrações → API){" "}
              {configurado.api_token && <Badge variant="verde">configurado {configurado.api_token}</Badge>}
            </Label>
            <Input
              id="sz_token"
              name="api_token"
              type="password"
              placeholder={configurado.api_token ? "manter o atual (deixe vazio)" : "api_key"}
            />
          </div>
          <div className="flex items-end gap-2">
            <BotaoSalvar />
          </div>
          <div className="lg:col-span-2">
            <Mensagem estado={estado} />
          </div>
        </form>
        <div className="mt-2">
          <BotaoAcao rotulo="Testar API" rotuloAguardando="Testando…" acao={testarApiSzchat} />
        </div>
      </div>
    </div>
  );
}
