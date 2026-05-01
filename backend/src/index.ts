import { Hono } from "hono";
import { cors } from "hono/cors";
import { jwt, sign } from "hono/jwt";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

export interface Env {
  DB: D1Database;
  APP_ORIGIN?: string;
  JWT_SECRET: string;
}

interface User {
  id: string;
  email: string;
  password_hash: string;
}

type Variables = {
  jwtPayload: {
    sub: string;
    email: string;
  };
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// --- Middleware ---

app.use(
  "*",
  cors({
    origin: (origin, c) => c.env.APP_ORIGIN || origin || "*",
    allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: false,
  })
);

// --- Schemas ---

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const itemSchema = z.object({
  addressKey: z.string(),
  notes: z.string().optional(),
  targetPrice: z.number().nullable().optional(),
  addedAt: z.string().optional(),
});

const shortlistSchema = z.object({
  shortlist: z.array(itemSchema),
});

// --- Helpers ---

const PBKDF2_ITERATIONS = 100000;
const SALT_SIZE = 16;

async function hashPassword(password: string, salt?: Uint8Array): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const internalSalt = salt || crypto.getRandomValues(new Uint8Array(SALT_SIZE));

  const keyMaterial = await crypto.subtle.importKey("raw", msgUint8, "PBKDF2", false, ["deriveBits"]);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: internalSalt as any,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  const saltHex = Array.from(internalSalt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [saltHex] = parts;
  const salt = new Uint8Array((saltHex.match(/.{1,2}/g) || []).map((byte) => parseInt(byte, 16)));
  const attemptHash = await hashPassword(password, salt);
  return attemptHash === storedHash;
}

// --- Routes ---

app.get("/api/health", (c) => c.json({ ok: true, service: "hdb-resale-visualizer-backend" }));

app.post("/api/auth/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const trimmedEmail = email.toLowerCase().trim();

  let user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(trimmedEmail)
    .first<User>();

  if (!user) {
    // Auto-signup
    const id = crypto.randomUUID();
    const pwdHash = await hashPassword(password);
    await c.env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(id, trimmedEmail, pwdHash, new Date().toISOString())
      .run();
    user = { id, email: trimmedEmail, password_hash: pwdHash };
  } else {
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }
  }

  const token = await sign(
    { sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 },
    c.env.JWT_SECRET
  );
  return c.json({ access_token: token, user: { id: user.id, email: user.email } });
});

// Protected routes
app.use("/api/shortlist", (c, next) => jwt({ secret: c.env.JWT_SECRET, alg: "HS256" })(c, next));

app.get("/api/shortlist", async (c) => {
  const payload = c.get("jwtPayload");
  const userId = payload.sub;

  const row = await c.env.DB.prepare("SELECT shortlist FROM user_shortlists WHERE user_id = ?")
    .bind(userId)
    .first<{ shortlist: string }>();

  if (!row) {
    return c.json({ shortlist: [] });
  }

  try {
    const raw = JSON.parse(row.shortlist);
    const validated = z.array(itemSchema).parse(raw);
    return c.json({ shortlist: validated });
  } catch {
    return c.json({ error: "Failed to parse saved data" }, 500);
  }
});

app.put("/api/shortlist", zValidator("json", shortlistSchema), async (c) => {
  const payload = c.get("jwtPayload");
  const userId = payload.sub;
  const { shortlist } = c.req.valid("json");

  await c.env.DB.prepare(
    "INSERT INTO user_shortlists (user_id, shortlist, updated_at) VALUES (?, ?, ?) " +
      "ON CONFLICT(user_id) DO UPDATE SET shortlist = EXCLUDED.shortlist, updated_at = EXCLUDED.updated_at"
  )
    .bind(userId, JSON.stringify(shortlist), new Date().toISOString())
    .run();

  return c.json({ ok: true });
});

export default app;
