import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const dir=process.cwd();
for (const a of [`${dir}/.env.local`,`${dir}/.env`]){ if(!existsSync(a))continue; for(const l of readFileSync(a,"utf8").split("\n")){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}}
const url=process.env.NEXT_PUBLIC_SUPABASE_URL, anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, srv=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=createClient(url, srv, { auth:{persistSession:false} });
const { data } = await admin.auth.admin.generateLink({ type:"magiclink", email:"pjmatos2@gmail.com" });
const v = await fetch(`${url}/auth/v1/verify?token=${data.properties.hashed_token}&type=magiclink`, { redirect:"manual", headers:{apikey:anon} });
const at = new URL((v.headers.get("location")??"").replace("#","?")).searchParams.get("access_token");
const cli = createClient(url, anon, { global:{ headers:{ Authorization:`Bearer ${at}` } }, auth:{persistSession:false} });
const uid = JSON.parse(Buffer.from(at.split(".")[1],"base64url").toString()).sub;

for (const espera of [0, 1000, 2000, 4000, 8000]) {
  if (espera) await new Promise(r=>setTimeout(r, espera - (espera===1000?0:0)));
  const q = await cli.from("usuarios").select("nome, perfil, ativo").eq("id", uid).maybeSingle();
  const t = Math.round((Date.now()/1000) - JSON.parse(Buffer.from(at.split(".")[1],"base64url").toString()).iat);
  console.log(`t+${String(t).padStart(2)}s  ->  ${q.data ? "OK: "+q.data.nome+" / "+q.data.perfil : "FALHOU: "+(q.error?.code||"")+" "+(q.error?.message||"nulo")}`);
}
