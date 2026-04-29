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

export const hasCloudSyncConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

async function request<T>(path: string, init: RequestInit): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

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
  return request("/rest/v1/user_shortlists", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      user_id: session.userId,
      shortlist: items,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function pullShortlistFromCloud(session: AuthSession): Promise<ShortlistItem[] | null> {
  const rows = await request<Array<{ shortlist: ShortlistItem[] }>>(
    `/rest/v1/user_shortlists?select=shortlist&user_id=eq.${session.userId}&limit=1`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  );

  return rows[0]?.shortlist ?? null;
}
