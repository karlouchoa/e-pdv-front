import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const hostname = (req.headers.get("host") || "").toLowerCase();
  const url = req.nextUrl.clone();

  const baseHosts = [
    "goldpdv.com.br",
    "www.goldpdv.com.br",
    "localhost:3000",
    "localhost:3001",
  ];

  if (baseHosts.includes(hostname)) {
    return NextResponse.next();
  }

  const currentHost = hostname
    .replace(".localhost:3001", "") // desenvolvimento
    .replace(".localhost:3000", "")
    .replace(".goldpdv.com.br", ""); // producao

  const tenantId = currentHost;

  if (!tenantId || tenantId === "www") {
    return NextResponse.next();
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
