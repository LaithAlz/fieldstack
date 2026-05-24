#!/usr/bin/env node
/**
 * Rewrites EXPO_PUBLIC_API_URL in fieldstack-app/.env to use this machine's
 * current LAN IP. Wired as a `prestart` hook so it runs every time you launch
 * Expo — no more "phone can't reach the API after switching Wi-Fi" debugging.
 *
 * - Picks a Wi-Fi/Ethernet IPv4 interface (en0/en1/eth0/wlan0 preferred).
 * - Skips loopback, virtual, and known VM/VPN interfaces (docker, vmnet,
 *   vboxnet, utun, tun, tap).
 * - Preserves whatever port is already in the URL; falls back to 3000.
 * - No-op when the IP already matches — keeps the .env diff clean.
 * - Refuses to touch the file if it can't find a usable IP (warns instead),
 *   so a flight-mode laptop doesn't blank the URL.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ENV_PATH = path.resolve(__dirname, "..", ".env");
const URL_KEY = "EXPO_PUBLIC_API_URL";
const DEFAULT_PORT = 3000;

// Interface name prefixes to skip outright. Anything matching here can't be
// the host's primary LAN interface.
const SKIP_PREFIXES = [
  "lo", "docker", "vmnet", "vboxnet", "utun", "tun", "tap", "br-", "veth",
  "awdl", "llw", "bridge", "anpi",
];

// Interface name prefixes to prefer, in order. macOS Wi-Fi is usually en0;
// USB-C Ethernet often comes up as en6/en7; Linux Wi-Fi is wlan0/wlp*; Linux
// Ethernet is eth0/enp*.
const PREFER_PREFIXES = ["en", "wlan", "wlp", "eth", "enp"];

function pickLanIp() {
  const candidates = [];
  const interfaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    if (SKIP_PREFIXES.some((p) => name.startsWith(p) && name !== "en0" && name !== "en1")) {
      // The lo prefix is the common loopback skip; treat anything matching
      // a skip prefix as off-limits, but allow en0/en1 explicitly because
      // they're standard macOS Wi-Fi / Ethernet.
      continue;
    }
    for (const a of addrs) {
      if (a.family !== "IPv4") continue;
      if (a.internal) continue;
      candidates.push({ name, address: a.address });
    }
  }

  // Sort: preferred prefix order first, then alphabetical name within a tier
  // (so en0 beats en6 beats anything else).
  candidates.sort((a, b) => {
    const tierA = PREFER_PREFIXES.findIndex((p) => a.name.startsWith(p));
    const tierB = PREFER_PREFIXES.findIndex((p) => b.name.startsWith(p));
    const ta = tierA === -1 ? PREFER_PREFIXES.length : tierA;
    const tb = tierB === -1 ? PREFER_PREFIXES.length : tierB;
    if (ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name);
  });

  return candidates[0] ?? null;
}

function readEnv() {
  if (!fs.existsSync(ENV_PATH)) return null;
  return fs.readFileSync(ENV_PATH, "utf8");
}

function extractPort(currentUrl) {
  if (!currentUrl) return DEFAULT_PORT;
  const m = currentUrl.match(/:(\d+)(?:\/|$)/);
  return m ? Number(m[1]) : DEFAULT_PORT;
}

function rewriteEnv(content, newUrl) {
  // Match the EXPO_PUBLIC_API_URL line (anywhere in the file). If it doesn't
  // exist, append it. Preserves the rest of the file exactly.
  const re = new RegExp(`^${URL_KEY}=.*$`, "m");
  if (re.test(content)) {
    return content.replace(re, `${URL_KEY}=${newUrl}`);
  }
  // No existing key — append, preserving trailing newline behavior.
  const sep = content.endsWith("\n") ? "" : "\n";
  return `${content}${sep}${URL_KEY}=${newUrl}\n`;
}

function main() {
  const picked = pickLanIp();
  if (!picked) {
    console.warn(
      "[sync-api-url] No usable LAN IP found. Leaving .env unchanged.\n" +
        "  (Are you on a network? Check `ifconfig` / `ipconfig getifaddr en0`.)"
    );
    return;
  }

  const existing = readEnv();
  if (existing === null) {
    console.warn(`[sync-api-url] ${ENV_PATH} does not exist. Skipping.`);
    return;
  }

  const currentLine = existing.match(new RegExp(`^${URL_KEY}=(.+)$`, "m"));
  const currentUrl = currentLine ? currentLine[1].trim() : null;
  const port = extractPort(currentUrl);
  const newUrl = `http://${picked.address}:${port}`;

  if (currentUrl === newUrl) {
    console.log(`[sync-api-url] ${URL_KEY} already correct (${newUrl}).`);
    return;
  }

  const next = rewriteEnv(existing, newUrl);
  fs.writeFileSync(ENV_PATH, next, "utf8");
  console.log(
    `[sync-api-url] ${URL_KEY}: ${currentUrl ?? "(unset)"} → ${newUrl}  (iface ${picked.name})`
  );
}

main();
