import { randomUUID } from "node:crypto";
import { OAuth2Client } from "google-auth-library";

export const AUTH_COOKIE = "idea_dojo_session";
export const DEFAULT_SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function parseCookies(header = "") {
  return Object.fromEntries(String(header)
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf("=");
      const name = separator >= 0 ? entry.slice(0, separator) : entry;
      const value = separator >= 0 ? entry.slice(separator + 1) : "";
      try { return [name, decodeURIComponent(value)]; }
      catch { return [name, value]; }
    }));
}

function cleanProfileText(value, maximum) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export class GoogleAuthSessions {
  constructor({
    clientId = "",
    verifier,
    secureCookies = process.env.NODE_ENV === "production",
    sessionDuration = DEFAULT_SESSION_DURATION,
    now = () => Date.now(),
  } = {}) {
    this.clientId = String(clientId || "").trim();
    this.verifier = verifier || (this.clientId ? new OAuth2Client() : null);
    this.secureCookies = secureCookies;
    this.sessionDuration = sessionDuration;
    this.now = now;
    this.sessions = new Map();
  }

  get configured() {
    return Boolean(this.clientId && this.verifier);
  }

  cookie(value, maxAgeSeconds) {
    return [
      `${AUTH_COOKIE}=${encodeURIComponent(value)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
      this.secureCookies ? "Secure" : "",
    ].filter(Boolean).join("; ");
  }

  clearCookie() {
    return this.cookie("", 0);
  }

  async signIn(credential) {
    if (!this.configured) throw new AuthError("Google sign-in has not been configured yet.", 503);
    if (typeof credential !== "string" || !credential.trim() || credential.length > 10_000) {
      throw new AuthError("Google did not return a usable identity credential.", 400);
    }

    let payload;
    try {
      const ticket = await this.verifier.verifyIdToken({
        idToken: credential,
        audience: this.clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new AuthError("Google could not verify this sign-in.");
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new AuthError("A verified Google account is required.");
    }

    const user = {
      id: cleanProfileText(payload.sub, 255),
      email: cleanProfileText(payload.email, 320),
      name: cleanProfileText(payload.name || payload.given_name || payload.email, 120),
      picture: cleanProfileText(payload.picture, 1000),
    };
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= this.now()) this.sessions.delete(id);
    }
    const sessionId = randomUUID();
    const expiresAt = this.now() + this.sessionDuration;
    this.sessions.set(sessionId, { user, expiresAt });
    return {
      user,
      cookie: this.cookie(sessionId, this.sessionDuration / 1000),
    };
  }

  userForRequest(request) {
    const sessionId = parseCookies(request?.headers?.cookie)[AUTH_COOKIE];
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session.user;
  }

  signOut(request) {
    const sessionId = parseCookies(request?.headers?.cookie)[AUTH_COOKIE];
    if (sessionId) this.sessions.delete(sessionId);
    return this.clearCookie();
  }
}
