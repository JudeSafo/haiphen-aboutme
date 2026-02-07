import crypto from "node:crypto";

const CONTACT_ORIGIN = process.env.CONTACT_ORIGIN;
const WELCOME_HMAC_SECRET = process.env.WELCOME_HMAC_SECRET;
const USER_LOGIN = process.env.USER_LOGIN || "haiphenAI";

if (!CONTACT_ORIGIN || !WELCOME_HMAC_SECRET) {
  console.error("Missing CONTACT_ORIGIN or WELCOME_HMAC_SECRET");
  process.exit(1);
}

const bodyObj = {
  user_login: USER_LOGIN,
  source: "manual_node_test",
  request_id: "manual-" + crypto.randomUUID(),
  entitlement_updated_at: Math.floor(Date.now() / 1000),
};

const body = JSON.stringify(bodyObj);
const ts = String(Date.now());
const sig = crypto
  .createHmac("sha256", WELCOME_HMAC_SECRET)
  .update(`${ts}.${body}`)
  .digest("hex");

const url = `${CONTACT_ORIGIN.replace(/\/+$/, "")}/api/welcome`;

const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-haiphen-ts": ts,
    "x-haiphen-sig": sig,
  },
  body,
});

console.log("status:", res.status);
console.log(await res.text());