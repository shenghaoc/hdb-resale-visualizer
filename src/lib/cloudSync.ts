import type { ShortlistItem } from "@/types/data";

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
};

type SupabaseAuthResponse = {
  access_token: string;
  refresh_token: string;
  user: { id: string; email?: string };
};

const env = import.meta.env as Record<string, string | undefined>;
const SUPABASE_URL = env.VITE_SUPABASE_URL?.trim();
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY?.trim();
const BACKEND_URL = env.VITE_BACKEND_URL?.trim();

export const hasCloudSyncConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && BACKEND_URL);

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    const payload: unknown = JSON.parse(json);
    return typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function assertPublicAnonKey() {
  if (!SUPABASE_ANON_KEY) {
    return;
  }

  const payload = parseJwtPayload(SUPABASE_ANON_KEY);
  const role = typeof payload?.role === "string" ? payload.role : null;
  if (role === "service_role") {
    throw new Error(
      "Unsafe Supabase key detected: never expose SERVICE_ROLE keys in VITE_* vars. Use anon/public key only.",
    );
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  assertPublicAnonKey();

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      ...init.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "msg" in payload
        ? String((payload as Record<string, unknown>).msg)
        : response.statusText;
    throw new Error(message || "Supabase request failed");
  }

  return payload as T;
}

export async function signInWithPassword(email: string, password: string): Promise<AuthSession> {
  const auth = await request<SupabaseAuthResponse>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  return {
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token,
    userId: auth.user.id,
    email: auth.user.email ?? email,
  };
}

export async function syncShortlistToCloud(session: AuthSession, items: ShortlistItem[]) {
  if (!BACKEND_URL) {
    throw new Error("Backend is not configured. Set VITE_BACKEND_URL.");
  }
  const response = await fetch(`${BACKEND_URL}/api/shortlist`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ shortlist: items }),
  });
  if (!response.ok) throw new Error("Failed to sync shortlist to backend");
  const payload = (await response.json().catch(() => null)) as unknown;
  return payload;
}

export async function pullShortlistFromCloud(session: AuthSession): Promise<ShortlistItem[] | null> {
  if (!BACKEND_URL) {
    throw new Error("Backend is not configured. Set VITE_BACKEND_URL.");
  }
  const response = await fetch(`${BACKEND_URL}/api/shortlist`, {
    method: "GET",
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok) throw new Error("Failed to fetch shortlist from backend");
  const payload = (await response.json()) as { shortlist?: ShortlistItem[] };
  return payload.shortlist ?? null;
}
