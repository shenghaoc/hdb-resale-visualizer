export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  APP_ORIGIN?: string;
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function resolveOrigin(request: Request, env: Env): string {
  const configured = env.APP_ORIGIN?.trim();
  if (configured && configured.length > 0) return configured;
  return request.headers.get("Origin") ?? "*";
}

function json(data: unknown, origin: string, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

const defaultCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const jsonPayload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const parsed: unknown = JSON.parse(jsonPayload);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length).trim();
}

async function supabaseRequest<T>(env: Env, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status})`);
  }
  return payload as T;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = resolveOrigin(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "hdb-resale-visualizer-backend" }, origin);
    }

    if (url.pathname === "/api/config" && request.method === "GET") {
      return json({ supabaseUrl: env.SUPABASE_URL }, origin);
    }

    if (url.pathname === "/api/shortlist") {
      const token = getBearerToken(request);
      if (!token) return json({ error: "Missing bearer token" }, origin, 401);
      const payload = parseJwtPayload(token);
      const userId = typeof payload?.sub === "string" ? payload.sub : null;
      if (!userId) return json({ error: "Invalid token" }, origin, 401);

      if (request.method === "GET") {
        const rows = await supabaseRequest<Array<{ shortlist: unknown[] }>>(
          env,
          `/rest/v1/user_shortlists?select=shortlist&user_id=eq.${userId}&limit=1`,
          { method: "GET" },
        );
        return json({ shortlist: rows[0]?.shortlist ?? [] }, origin);
      }

      if (request.method === "PUT") {
        const body = (await request.json().catch(() => null)) as { shortlist?: unknown[] } | null;
        if (!body || !Array.isArray(body.shortlist)) {
          return json({ error: "Expected { shortlist: [] }" }, origin, 400);
        }
        await supabaseRequest(
          env,
          "/rest/v1/user_shortlists",
          {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify({
              user_id: userId,
              shortlist: body.shortlist,
              updated_at: new Date().toISOString(),
            }),
          },
        );
        return json({ ok: true }, origin);
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...defaultCorsHeaders },
    });
  },
};
