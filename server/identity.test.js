import assert from "node:assert/strict";
import test from "node:test";
import { authenticatedUser, signInPath, signOutPath } from "./identity.js";

test("Sites identity headers produce stable private owner ids", async () => {
  const first = await authenticatedUser(new Request("https://idea-dojo.example/api/ideas", {
    headers: { "oai-authenticated-user-email": "Creator@Example.com" },
  }));
  const same = await authenticatedUser(new Request("https://idea-dojo.example/api/ideas", {
    headers: { "oai-authenticated-user-email": "creator@example.com" },
  }));
  const other = await authenticatedUser(new Request("https://idea-dojo.example/api/ideas", {
    headers: { "oai-authenticated-user-email": "other@example.com" },
  }));

  assert.equal(first.email, "creator@example.com");
  assert.equal(first.ownerId, same.ownerId);
  assert.notEqual(first.ownerId, other.ownerId);
  assert.equal(first.ownerId.length, 64);
});

test("local identity fallback never applies to a deployed hostname", async () => {
  const local = await authenticatedUser(new Request("http://127.0.0.1:5174/api/ideas"), {
    LOCAL_DEV_USER_EMAIL: "local@example.com",
  });
  const deployed = await authenticatedUser(new Request("https://idea-dojo.example/api/ideas"), {
    LOCAL_DEV_USER_EMAIL: "local@example.com",
  });

  assert.equal(local.email, "local@example.com");
  assert.equal(deployed, null);
});

test("Sign in with ChatGPT paths reject cross-origin return targets", () => {
  assert.equal(signInPath("/labyrinth"), "/signin-with-chatgpt?return_to=%2Flabyrinth");
  assert.equal(signInPath("//malicious.example"), "/signin-with-chatgpt?return_to=%2F");
  assert.equal(signOutPath("https://malicious.example"), "/signout-with-chatgpt?return_to=%2F");
});
