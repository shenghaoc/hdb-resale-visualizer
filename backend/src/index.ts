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

app.use("*", (c, next) => cors({
  origin: c.env.APP_ORIGIN || "*",
  allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
})(c, next)); // eslint-disable-line @typescript-eslint/no-unsafe-argument

// --- Schemas ---

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const shortlistSchema = z.object({
  shortlist: z.array(z.any()),
});

// --- Helpers ---

async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- Routes ---

app.get("/api/health", (c) => c.json({ ok: true, service: "hdb-resale-visualizer-backend" }));

app.post("/api/auth/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const trimmedEmail = email.toLowerCase().trim();
  const pwdHash = await hashPassword(password);

  let user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(trimmedEmail)
    .first<User>();

  if (!user) {
    // Auto-signup
    const id = crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(id, trimmedEmail, pwdHash, new Date().toISOString())
      .run();
    user = { id, email: trimmedEmail, password_hash: pwdHash };
  } else if (user.password_hash !== pwdHash) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await sign({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 }, c.env.JWT_SECRET);
  return c.json({ access_token: token, user: { id: user.id, email: user.email } });
});

// Protected routes
app.use("/api/shortlist/*", (c, next) => jwt({ secret: c.env.JWT_SECRET })(c, next)); // eslint-disable-line @typescript-eslint/no-unsafe-argument

app.get("/api/shortlist", async (c) => {
  const payload = c.get("jwtPayload");
  const userId = payload.sub;

  const row = await c.env.DB.prepare("SELECT shortlist FROM user_shortlists WHERE user_id = ?")
    .bind(userId)
    .first<{ shortlist: string }>();

  const shortlist = row ? (JSON.parse(row.shortlist) as unknown[]) : [];
  return c.json({ shortlist });
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
