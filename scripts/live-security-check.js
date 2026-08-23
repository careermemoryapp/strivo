#!/usr/bin/env node
// Runs a handful of "is this actually true on the live site right now"
// checks and writes the result to live-security-status.json, which the
// admin dashboard's Live security checks panel reads. Deliberately plain
// Node (no npm deps, no build step) so it can run directly via cron, e.g.:
//   0 */6 * * * cd /home/ubuntu/strivo && node scripts/live-security-check.js
//
// How this is different from the static Security status panel and from
// Sentry:
// - securityStatus.ts / npm audit (security-audit.json) checks the CODE:
//   what protections are built in, what known vulnerabilities exist in
//   dependencies. That can be right even if the live server is currently
//   misconfigured.
// - Sentry is reactive: it only reports something once a real request
//   throws an exception. It has no idea whether the SSL cert is about to
//   expire or whether Nginx quietly stopped sending a security header --
//   neither of those throws an exception for Sentry to catch.
// - This script is proactive: it actually connects to the live site over
//   the network, the same way an outside visitor or attacker would, and
//   checks specific facts that can silently drift after a deploy without
//   any code change at all.

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const tls = require("tls");
const { URL } = require("url");

const ROOT = path.join(__dirname, "..");
const OUTPUT_FILE = path.join(ROOT, "live-security-status.json");

// .env.local isn't loaded automatically outside of `next start` -- read
// just the one line this script needs without pulling in a dotenv
// dependency. Falls back to production's domain if unreadable.
function readEnvLocal(key) {
  try {
    const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
    const match = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

const baseUrl = (readEnvLocal("NEXTAUTH_URL") || "https://strivo.ai").replace(/\/$/, "");
const hostname = new URL(baseUrl).hostname;

const REQUIRED_HEADERS = [
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
  "strict-transport-security",
];

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

function httpGetNoRedirect(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 10000 }, (res) => {
      resolve({ statusCode: res.statusCode, headers: res.headers });
      res.resume();
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

function checkCertificate() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: 10000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert || !cert.valid_to) {
        finish({
          id: "ssl-certificate",
          label: "SSL certificate",
          status: "fail",
          detail: "Connected, but could not read the certificate.",
        });
        return;
      }
      const expiresAt = new Date(cert.valid_to);
      const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft < 0) {
        finish({
          id: "ssl-certificate",
          label: "SSL certificate",
          status: "fail",
          detail: `Certificate expired ${Math.abs(daysLeft)} day(s) ago.`,
        });
      } else if (daysLeft < 14) {
        finish({
          id: "ssl-certificate",
          label: "SSL certificate",
          status: "warn",
          detail: `Expires in ${daysLeft} day(s), on ${expiresAt.toDateString()}. Certbot should auto-renew around day 30 before expiry -- worth checking it's still running.`,
        });
      } else {
        finish({
          id: "ssl-certificate",
          label: "SSL certificate",
          status: "pass",
          detail: `Valid until ${expiresAt.toDateString()} (${daysLeft} days left).`,
        });
      }
    });
    socket.on("timeout", () => {
      socket.destroy();
      finish({ id: "ssl-certificate", label: "SSL certificate", status: "fail", detail: "Connection timed out." });
    });
    socket.on("error", (e) => {
      finish({ id: "ssl-certificate", label: "SSL certificate", status: "fail", detail: `Could not connect: ${e.message}` });
    });
  });
}

async function checkHttpsRedirect() {
  try {
    const res = await httpGetNoRedirect(`http://${hostname}/`);
    const location = res.headers.location || "";
    const isRedirect = res.statusCode >= 300 && res.statusCode < 400 && location.startsWith("https://");
    return {
      id: "https-redirect",
      label: "HTTP redirects to HTTPS",
      status: isRedirect ? "pass" : "fail",
      detail: isRedirect
        ? "Plain http:// requests are redirected to https://."
        : `Expected a redirect to https, got status ${res.statusCode}${location ? ` (location: ${location})` : ""}.`,
    };
  } catch (e) {
    return { id: "https-redirect", label: "HTTP redirects to HTTPS", status: "fail", detail: `Request failed: ${e.message}` };
  }
}

async function checkSecurityHeaders() {
  try {
    const res = await httpsGet(`${baseUrl}/`);
    const missing = REQUIRED_HEADERS.filter((h) => !res.headers[h]);
    return {
      id: "security-headers",
      label: "Security headers present",
      status: missing.length === 0 ? "pass" : "fail",
      detail: missing.length === 0 ? "All expected security headers are present on live responses." : `Missing on the live response: ${missing.join(", ")}.`,
    };
  } catch (e) {
    return { id: "security-headers", label: "Security headers present", status: "fail", detail: `Request failed: ${e.message}` };
  }
}

async function checkHealthEndpoint() {
  try {
    const res = await httpsGet(`${baseUrl}/api/health`);
    let ok = res.statusCode === 200;
    let detail = `/api/health returned status ${res.statusCode}.`;
    try {
      const parsed = JSON.parse(res.body);
      ok = ok && parsed.status === "ok" && parsed.database === "ok";
      if (ok) detail = "/api/health reports the app and database are both up.";
    } catch {
      ok = false;
    }
    return { id: "health-endpoint", label: "App + database reachable", status: ok ? "pass" : "fail", detail };
  } catch (e) {
    return { id: "health-endpoint", label: "App + database reachable", status: "fail", detail: `Request failed: ${e.message}` };
  }
}

async function checkAdminRoutesProtected() {
  try {
    const res = await httpsGet(`${baseUrl}/api/admin/security-status`);
    const isProtected = res.statusCode === 401;
    return {
      id: "admin-protected",
      label: "Admin routes reject unauthenticated requests",
      status: isProtected ? "pass" : "fail",
      detail: isProtected
        ? "A request with no admin session correctly gets a 401."
        : `Expected 401, got ${res.statusCode} -- admin data may be exposed to unauthenticated requests.`,
    };
  } catch (e) {
    return {
      id: "admin-protected",
      label: "Admin routes reject unauthenticated requests",
      status: "fail",
      detail: `Request failed: ${e.message}`,
    };
  }
}

function checkDependencyVulnerabilities() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, "security-audit.json"), "utf8");
    const parsed = JSON.parse(raw);
    const v = (parsed.metadata && parsed.metadata.vulnerabilities) || {};
    const critical = v.critical || 0;
    const high = v.high || 0;
    const moderate = v.moderate || 0;
    const status = critical > 0 ? "fail" : high > 0 ? "warn" : "pass";
    return {
      id: "dependency-vulnerabilities",
      label: "No critical/high dependency vulnerabilities",
      status,
      detail: `${critical} critical, ${high} high, ${moderate} moderate (from the last deploy's npm audit).`,
    };
  } catch {
    return {
      id: "dependency-vulnerabilities",
      label: "No critical/high dependency vulnerabilities",
      status: "warn",
      detail: "No dependency scan found yet -- runs automatically on the next deploy.",
    };
  }
}

async function main() {
  const checks = await Promise.all([
    checkCertificate(),
    checkHttpsRedirect(),
    checkSecurityHeaders(),
    checkHealthEndpoint(),
    checkAdminRoutesProtected(),
  ]);
  checks.push(checkDependencyVulnerabilities());

  const result = { checkedAt: new Date().toISOString(), baseUrl, checks };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));

  const failed = checks.filter((c) => c.status === "fail");
  const warned = checks.filter((c) => c.status === "warn");
  if (failed.length > 0) {
    console.error(`${failed.length} live security check(s) FAILING:`, failed.map((c) => c.label).join(", "));
    process.exitCode = 1;
  } else if (warned.length > 0) {
    console.warn(`${warned.length} live security check(s) warning:`, warned.map((c) => c.label).join(", "));
  } else {
    console.log(`All ${checks.length} live security checks passed.`);
  }
}

main().catch((e) => {
  console.error("live-security-check.js crashed:", e);
  process.exitCode = 1;
});
