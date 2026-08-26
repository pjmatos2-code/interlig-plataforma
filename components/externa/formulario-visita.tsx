"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarVisita } from "@/app/(app)/externa/acoes";
import { cn } from "@/lib/utils";

type PlanoOpcao = { id: string; nome: string; valor_referencia: number | null };
type Vendedora = { id: string; nome: string };

/** Reduz a foto no aparelho (máx 1280px, JPEG) — 4G de campo agradece. */
async function reduzirFoto(arquivo: File, maxLado = 1280): Promise<File> {
  try {
    const img = await createImageBitmap(arquivo);
    const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : arquivo;
  } catch {
    return arquivo;
  }
}

function CampoFoto({
  rotulo,
  dica,
  obrigatoria,
  arquivo,
  aoCapturar,
}: {
  rotulo: string;
  dica: string;
  obrigatoria?: boolean;
  arquivo: File | null;
  aoCapturar: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-slate-700">
        {rotulo} {obrigatoria && <span className="text-rose-500">*</span>}
      </p>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={cn(
          "relative flex h-40 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 border-dashed text-slate-400",
          arquivo ? "border-emerald-300" : "border-slate-300 active:bg-slate-50"
        )}
      >
        {previa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previa} alt={rotulo} className="h-full w-full object-cover" />
        ) : (
          <>
            <span className="text-3xl">📷</span>
            <span className="text-sm font-medium">Tirar foto</span>
            <span className="px-4 text-center text-xs">{dica}</span>
          </>
        )}
        {arquivo && (
          <span className="absolute bottom-2 right-2 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">
            ✓ capturada
          </span>
        )}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const menor = await reduzirFoto(f);
          aoCapturar(menor);
          setPrevia(URL.createObjectURL(menor));
        }}
      />
    </div>
  );
}

export function FormularioVisita({
  planos,
  vendedoras,
  ehVendedora,
  setor = "pap",
}: {
  planos: PlanoOpcao[];
  vendedoras: Vendedora[];
  ehVendedora: boolean;
  setor?: "pap" | "corporativo";
}) {
  const router = useRouter();
  const [enviando, comecar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [fotoCasa, setFotoCasa] = useState<File | null>(null);
  const [fotoDoc, setFotoDoc] = useState<File | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; prec: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"ocioso" | "buscando" | "ok" | "falhou">("ocioso");
  const [gpsMotivo, setGpsMotivo] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function pedirGps() {
    if (!("geolocation" in navigator)) {
      setGpsStatus("falhou");
      setGpsMotivo("Este navegador não oferece localização.");
      return;
    }
    setGpsStatus("buscando");
    setGpsMotivo(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps({ lat: p.coords.latitude, lng: p.coords.longitude, prec: p.coords.accuracy });
        setGpsStatus("ok");
      },
      (e) => {
        setGpsStatus("falhou");
        setGpsMotivo(
          e.code === 1
            ? "Permissão de localização negada. No iPhone: toque em “aA” na barra do Safari → Configurações do Site → Localização → Permitir. Ou Ajustes → Privacidade → Serviços de Localização → Safari."
            : e.code === 2
              ? "Sinal de GPS indisponível agora — tente em céu aberto."
              : "Tempo esgotado buscando o GPS — tente de novo."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  // GPS entra junto com a foto da casa — pedido do fluxo
  function capturarCasa(f: File | null) {
    setFotoCasa(f);
    if (!f) return;
    pedirGps();
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const form = e.currentTarget;
    const dados = new FormData(form);
    if (fotoCasa) dados.set("foto_casa", fotoCasa);
    if (fotoDoc) dados.set("foto_doc", fotoDoc);
    if (gps) {
      dados.set("lat", String(gps.lat));
      dados.set("lng", String(gps.lng));
      dados.set("precisao", String(gps.prec));
    }
    comecar(async () => {
      try {
        dados.set("setor", setor);
        const r = await registrarVisita({}, dados);
        if (r.erro) {
          setErro(r.erro);
          return;
        }
        setSucesso("Visita registrada! Ticket criado no CRM. 🎉");
        setFotoCasa(null);
        setFotoDoc(null);
        setGps(null);
        setGpsStatus("ocioso");
        formRef.current?.reset();
        router.refresh();
        setTimeout(() => setSucesso(null), 4000);
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Falha ao enviar. Tente de novo.");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={enviar} className="space-y-4">
      {/* 1 — identificação */}
      <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-interlig-azul">
          1 · Identificação do cliente
        </p>
        <label className="mb-1 block text-sm font-semibold text-slate-700">
          Nome do cliente <span className="text-rose-500">*</span>
        </label>
        <input
          name="cliente_nome"
          required
          placeholder="Nome completo"
          className="mb-3 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base"
        />
        <label className="mb-1 block text-sm font-semibold text-slate-700">
          Contato (WhatsApp) <span className="text-rose-500">*</span>
        </label>
        <input
          name="telefone"
          required
          type="tel"
          inputMode="tel"
          placeholder="(93) 9…"
          className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base"
        />
        {!ehVendedora && vendedoras.length > 0 && (
          <>
            <label className="mb-1 mt-3 block text-sm font-semibold text-slate-700">Agente</label>
            <select
              name="vendedor_id"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base"
            >
              <option value="">Selecione…</option>
              {vendedoras.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* 2 — documentação */}
      <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-interlig-azul">
          2 · Documentação
        </p>
        <div className="space-y-3">
          <CampoFoto
            rotulo="Foto da frente da casa"
            dica="A localização é capturada automaticamente com a foto"
            obrigatoria
            arquivo={fotoCasa}
            aoCapturar={capturarCasa}
          />
          <div
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-medium",
              gpsStatus === "ok" && "bg-emerald-50 text-emerald-700",
              gpsStatus === "buscando" && "bg-sky-50 text-sky-700",
              gpsStatus === "falhou" && "bg-amber-50 text-amber-800",
              gpsStatus === "ocioso" && "bg-slate-50 text-slate-400"
            )}
          >
            {gpsStatus === "ok" && `📍 Localização capturada (±${Math.round(gps?.prec ?? 0)} m)`}
            {gpsStatus === "buscando" && "📡 Buscando localização…"}
            {gpsStatus === "ocioso" && "📍 A localização entra junto com a foto da casa"}
            {gpsStatus === "falhou" && (
              <>
                <p>⚠️ Sem localização — a visita pode ser registrada mesmo assim.</p>
                {gpsMotivo && <p className="mt-1 font-normal">{gpsMotivo}</p>}
                <button
                  type="button"
                  onClick={pedirGps}
                  className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 font-bold text-white active:scale-95"
                >
                  🔄 Tentar localização de novo
                </button>
              </>
            )}
          </div>
          <CampoFoto
            rotulo="Documento do cliente (opcional)"
            dica="Para gerar o pré-cadastro no SGP"
            arquivo={fotoDoc}
            aoCapturar={setFotoDoc}
          />
        </div>
      </div>

      {/* 3 — registro */}
      <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-interlig-azul">
          3 · Registro
        </p>
        <label className="mb-1 block text-sm font-semibold text-slate-700">
          Plano de interesse
        </label>
        <select
          name="plano_id"
          className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base"
        >
          <option value="">Selecione o plano…</option>
          {planos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
              {p.valor_referencia ? ` — R$ ${Number(p.valor_referencia).toFixed(2).replace(".", ",")}` : ""}
            </option>
          ))}
        </select>
      </div>

      {erro && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{erro}</p>
      )}
      {sucesso && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {sucesso}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className={cn(
          "h-14 w-full rounded-2xl bg-interlig-azul text-base font-bold text-white shadow-lg shadow-interlig-azul/25 active:scale-[0.99]",
          enviando && "animate-pulse opacity-70"
        )}
      >
        {enviando ? "Enviando…" : "✓ Registrar visita"}
      </button>
    </form>
  );
}
