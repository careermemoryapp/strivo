import crypto from "node:crypto";

// Apple's OAuth client_secret isn't a static string like Google's -- Apple
// requires it to be a short-lived JWT that Strivo signs itself with the
// private key (.p8) downloaded once from the Apple Developer portal when
// the Sign in with Apple key was created (see
// docs/apple-app-store-checklist.md item 0 for the full setup steps).
//
// Generated fresh every time this module loads (once per server process --
// see the comment on EXPIRY_SECONDS below for why that's the right
// lifetime), rather than requiring a human to regenerate and redeploy a
// static secret before it expires. There's nothing to forget here as long
// as Strivo gets redeployed at least once every ~150 days, which in
// practice it does constantly.
function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// Apple's own hard cap is 6 months (15,777,000s). 150 days leaves a
// comfortable safety margin under that, and this only needs to outlive the
// current server process, not any fixed calendar period -- every deploy
// (bash scripts/deploy.sh) restarts the process via pm2 reload, which reruns
// this at module-load time and mints a brand new one. The only way this
// actually goes stale is Strivo going 150+ days with zero deploys, which
// would be unusual given how often this app ships changes -- worth
// revisiting only if that ever becomes the actual cadence.
const EXPIRY_SECONDS = 150 * 24 * 60 * 60;

export function generateAppleClientSecret(): string {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const clientId = process.env.APPLE_CLIENT_ID; // the Services ID (e.g. ai.strivo.app.signin), NOT the app's bundle ID
  const rawPrivateKey = process.env.APPLE_PRIVATE_KEY;
  if (!teamId || !keyId || !clientId || !rawPrivateKey) {
    throw new Error("Missing Apple Sign In env vars (APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_CLIENT_ID/APPLE_PRIVATE_KEY)");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + EXPIRY_SECONDS,
    aud: "https://appleid.apple.com",
    sub: clientId,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // The .p8 file's contents only fit into a single-line env var with literal
  // "\n" sequences standing in for real newlines -- convert those back
  // before handing the key to node:crypto, which needs an actual multi-line
  // PEM block.
  const pemKey = rawPrivateKey.replace(/\\n/g, "\n");

  // Apple requires the raw (r||s) "IEEE P1363" signature format, not the
  // ASN.1 DER format node:crypto produces by default for EC keys. Getting
  // this wrong is a well-known, confusing failure mode -- Apple just rejects
  // the client_secret with no specific error pointing at this -- so it's
  // called out explicitly here rather than left as an unexplained option.
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: pemKey,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${base64url(signature)}`;
}

// Wraps the above so a missing/incomplete Apple config degrades to "Apple
// sign-in doesn't work yet" rather than crashing the entire auth module (and
// taking Google sign-in down with it) -- relevant right up until the Apple
// Developer Portal setup steps in docs/apple-app-store-checklist.md item 0
// are actually done and the env vars above are set.
export function tryGenerateAppleClientSecret(): string {
  try {
    return generateAppleClientSecret();
  } catch {
    return "";
  }
}
