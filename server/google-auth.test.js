import test from "node:test";
import assert from "node:assert/strict";
import { AUTH_COOKIE, AuthError, GoogleAuthSessions, parseCookies } from "./google-auth.js";

function verifierFor(payload, calls = []) {
  return {
    async verifyIdToken(options) {
      calls.push(options);
      return { getPayload: () => payload };
    },
  };
}

test("cookie parsing preserves values containing equals signs", () => {
  assert.deepEqual(parseCookies("one=1; token=a%3Db; empty="), { one: "1", token: "a=b", empty: "" });
});

test("unconfigured Google sign-in fails without creating a session", async () => {
  const auth = new GoogleAuthSessions();
  await assert.rejects(() => auth.signIn("credential"), (error) => error instanceof AuthError && error.status === 503);
  assert.equal(auth.sessions.size, 0);
});

test("verified Google identity creates an HTTP-only app session", async () => {
  const calls = [];
  const auth = new GoogleAuthSessions({
    clientId: "web-client.apps.googleusercontent.com",
    verifier: verifierFor({
      sub: "google-user-123",
      email: "maker@example.com",
      email_verified: true,
      name: "Quiet Maker",
      picture: "https://example.com/avatar.png",
    }, calls),
    secureCookies: true,
  });

  const result = await auth.signIn("signed-google-token");
  assert.deepEqual(calls, [{
    idToken: "signed-google-token",
    audience: "web-client.apps.googleusercontent.com",
  }]);
  assert.deepEqual(result.user, {
    id: "google-user-123",
    email: "maker@example.com",
    name: "Quiet Maker",
    picture: "https://example.com/avatar.png",
  });
  assert.match(result.cookie, new RegExp(`^${AUTH_COOKIE}=`));
  assert.match(result.cookie, /HttpOnly/);
  assert.match(result.cookie, /SameSite=Lax/);
  assert.match(result.cookie, /Secure/);

  const cookiePair = result.cookie.split(";")[0];
  assert.deepEqual(auth.userForRequest({ headers: { cookie: cookiePair } }), result.user);
});

test("unverified email claims are rejected", async () => {
  const auth = new GoogleAuthSessions({
    clientId: "client-id",
    verifier: verifierFor({ sub: "123", email: "maker@example.com", email_verified: false }),
  });
  await assert.rejects(() => auth.signIn("token"), /verified Google account/);
});

test("expired and signed-out sessions cannot be reused", async () => {
  let currentTime = 1000;
  const auth = new GoogleAuthSessions({
    clientId: "client-id",
    verifier: verifierFor({ sub: "123", email: "maker@example.com", email_verified: true }),
    sessionDuration: 100,
    now: () => currentTime,
  });
  const first = await auth.signIn("token");
  const firstCookie = first.cookie.split(";")[0];
  currentTime = 1101;
  assert.equal(auth.userForRequest({ headers: { cookie: firstCookie } }), null);

  currentTime = 1200;
  const second = await auth.signIn("token");
  const secondCookie = second.cookie.split(";")[0];
  assert.match(auth.signOut({ headers: { cookie: secondCookie } }), /Max-Age=0/);
  assert.equal(auth.userForRequest({ headers: { cookie: secondCookie } }), null);
});
