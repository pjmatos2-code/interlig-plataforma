import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/sync e /api/webhooks têm autenticação própria por segredo (CRON_SECRET
// e SZCHAT_WEBHOOK_SECRET) — não passam pela sessão de usuário.
const ROTAS_PUBLICAS = ["/login", "/auth", "/api/sync", "/api/webhooks", "/api/sz"];

export async function atualizarSessao(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const caminho = request.nextUrl.pathname;
  const publica = ROTAS_PUBLICAS.some((rota) => caminho.startsWith(rota));

  // Sessão órfã: o login continua válido no Auth, mas o cadastro em `usuarios`
  // sumiu (usuário removido). Sem este corte a pessoa entra em loop — /login
  // manda para /, / não acha o cadastro e manda de volta para /login. Encerra
  // a sessão aqui, que é o que resolve de verdade, em vez de mandar o usuário
  // limpar cookies no navegador.
  if (user) {
    const { data: cadastro } = await supabase
      .from("usuarios")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (!cadastro) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?motivo=sem-cadastro";
      const saida = NextResponse.redirect(url);
      for (const c of request.cookies.getAll()) {
        if (c.name.startsWith("sb-")) saida.cookies.delete(c.name);
      }
      return saida;
    }
  }

  if (!user && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("proximo", caminho);
    return NextResponse.redirect(url);
  }

  if (user && caminho === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
