import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const hostname = req.headers.get("host") || "";
  const url = req.nextUrl.clone();

  const currentHost = hostname
    .replace(".localhost:3001", "")   // desenvolvimento
    .replace(".goldpdv.com.br", "");   // producao

  const tenantId = currentHost;

  // opcional: validar tenantId com uma lista ou endpoint
  if (!tenantId || tenantId === "www") {
    url.pathname = "/404";
    return NextResponse.rewrite(url);
  }

  const res = NextResponse.next();

  // salvar tenant no cookie para ser usado no client/API
  res.cookies.set("X-Tenant", tenantId, {
    path: "/",
    httpOnly: true,
  });

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
