import crypto from 'node:crypto';
import { ZodError, type ZodType } from 'zod';
import { ApiError } from './errors';

export const SID_COOKIE = 'fb_sid';

export type Ctx = {
  req: Request;
  /** Anonymous device/session identity (HttpOnly cookie). Never derived from client-supplied ids. */
  sid: string;
  params: Record<string, string>;
  ip: string;
  url: URL;
  body: <T>(schema: ZodType<T>) => Promise<T>;
};

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function readSid(req: Request): string | null {
  const v = parseCookies(req.headers.get('cookie'))[SID_COOKIE];
  return v && /^[a-f0-9]{32}$/.test(v) ? v : null;
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}

function cookieHeader(sid: string): string {
  const secure = (process.env.APP_BASE_URL ?? '').startsWith('https://') ? '; Secure' : '';
  return `${SID_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`;
}

/** Wraps a route handler: session cookie, JSON bodies, validation, and uniform safe errors. */
export function route(fn: (ctx: Ctx) => Promise<unknown>) {
  return async (req: Request, routeCtx: { params: Promise<Record<string, string>> }): Promise<Response> => {
    let sid = readSid(req);
    const isNew = !sid;
    if (!sid) sid = crypto.randomBytes(16).toString('hex');
    const params = routeCtx?.params ? await routeCtx.params : {}; // Next always passes a context; the guard only helps direct calls in tests
    const ctx: Ctx = {
      req,
      sid,
      params,
      ip: clientIp(req),
      url: new URL(req.url),
      body: async (schema) => {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          throw new ApiError(400, 'invalid_body', 'Invalid JSON body');
        }
        return schema.parse(raw);
      },
    };

    let res: Response;
    try {
      const out = await fn(ctx);
      res = out instanceof Response ? out : Response.json(out ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      if (e instanceof ApiError) {
        res = Response.json({ error: { code: e.code, message: e.message } }, { status: e.status, headers: { 'Cache-Control': 'no-store' } });
      } else if (e instanceof ZodError) {
        res = Response.json({ error: { code: 'invalid_input', message: 'Invalid input', issues: e.issues.map((i) => i.path.join('.')) } }, { status: 400 });
      } else {
        console.error('[api] unhandled', e);
        res = Response.json({ error: { code: 'server_error', message: 'Something went wrong' } }, { status: 500 });
      }
    }
    if (isNew) res.headers.append('Set-Cookie', cookieHeader(sid));
    return res;
  };
}
