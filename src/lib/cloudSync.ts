import type { ShortlistItem } from "@/types/data";

export type AuthSession = {
  accessToken: string;
  userId: string;
  email: string;
};

type AuthResponse = {
  access_token: string;
  user: { id: string; email: string };
};

const env = import.meta.env as Record<string, string | undefined>;
const BACKEND_URL = env.VITE_BACKEND_URL?.trim();

export const hasCloudSyncConfig = Boolean(BACKEND_URL);

async function request<T>(path: string, init: RequestInit): Promise<T> {
  if (!BACKEND_URL) {
    throw new Error("Backend is not configured. Set VITE_BACKEND_URL.");
  }

  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const candidate =
      payload.message ||
      payload.msg ||
      payload.error_description ||
      payload.error ||
      response.statusText;

    const message = typeof candidate === "string" ? candidate : JSON.stringify(candidate);
    throw new Error(message || "Request failed");
  }

  return payload as T;
}

export async function signInWithPassword(email: string, password: string): Promise<AuthSession> {
  const auth = await request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  return {
    accessToken: auth.access_token,
    userId: auth.user.id,
    email: auth.user.email,
  };
}

export async function syncShortlistToCloud(session: AuthSession, items: ShortlistItem[]) {
  return request<{ ok: boolean }>("/api/shortlist", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ shortlist: items }),
  });
}

export async function pullShortlistFromCloud(session: AuthSession): Promise<ShortlistItem[] | null> {
  const payload = await request<{ shortlist?: ShortlistItem[] }>("/api/shortlist", {
    method: "GET",
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  return payload.shortlist ?? null;
}
