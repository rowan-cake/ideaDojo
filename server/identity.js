const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf8";

function cleanIdentityText(value, maximum) {
  return String(value || "").replace(/[\r\n\0]/g, "").trim().slice(0, maximum);
}

function localDevelopmentEmail(request, env) {
  const hostname = new URL(request.url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) return "";
  return cleanIdentityText(env.LOCAL_DEV_USER_EMAIL, 320).toLowerCase();
}

function decodeDisplayName(headers) {
  const encoded = headers.get(USER_FULL_NAME_HEADER);
  const encoding = headers.get(USER_FULL_NAME_ENCODING_HEADER);
  if (!encoded || ![PERCENT_ENCODED_UTF8, "percent-encoded-utf-8"].includes(encoding)) return "";
  try { return cleanIdentityText(decodeURIComponent(encoded), 120); }
  catch { return ""; }
}

async function ownerIdForEmail(email) {
  const bytes = new TextEncoder().encode(`idea-dojo:user:${email}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function authenticatedUser(request, env = {}) {
  const headerEmail = cleanIdentityText(request.headers.get(USER_EMAIL_HEADER), 320).toLowerCase();
  const email = headerEmail || localDevelopmentEmail(request, env);
  if (!email || !email.includes("@")) return null;
  const fullName = decodeDisplayName(request.headers);
  return {
    ownerId: await ownerIdForEmail(email),
    email,
    name: fullName || email.split("@")[0] || email,
  };
}

export function signInPath(returnTo = "/") {
  const safePath = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  return `/signin-with-chatgpt?return_to=${encodeURIComponent(safePath)}`;
}

export function signOutPath(returnTo = "/") {
  const safePath = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  return `/signout-with-chatgpt?return_to=${encodeURIComponent(safePath)}`;
}
