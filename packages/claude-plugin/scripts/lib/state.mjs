// Durable hook state: cache, log, pause sentinel, inflight lock (extracted
// from codex-pair-watch.mjs per ADR-088, originally ADR-079/082/085/086/087).
//
// ADR-092: all hook state nests under <markerDir>/.codex-pair/:
//   .codex-pair/context.md         — marker + project context
//   .codex-pair/log.jsonl          — durable verdicts log
//   .codex-pair/ignore             — gitignore-style globs (ADR-081)
//   .codex-pair/cache/             — content-hash response cache (ADR-082)
//   .codex-pair/state/paused       — pause sentinel (ADR-085)
//   .codex-pair/state/inflight/    — per-file locks (ADR-087)
//
// Atomic-write semantics per ADR-086/091: cache writes use tmp+rename;
// log entries are clamped under PIPE_BUF for atomic appendFile O_APPEND;
// log rotation uses a PID-scoped tmp; inflight-lock recovery uses an
// identity-snapshot recheck.

import { appendFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

// ADR-092 unified layout — everything lives under PAIR_ROOT_DIR.
export const PAIR_ROOT_DIR = ".codex-pair";
export const CONTEXT_FILENAME = "context.md";
export const IGNORE_FILENAME = "ignore";
export const LOG_FILENAME = "log.jsonl";
export const MAX_LOG_BYTES = Number(process.env.CODEX_PAIR_MAX_LOG_BYTES ?? 2_000_000);
export const MAX_LOG_ENTRIES = 1000;
export const MAX_LOG_REASON_BYTES = 3500;

export const CACHE_DIR = "cache";
export const CACHE_TTL_MS = 10 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 50;

export const STATE_DIR = "state";
export const PAUSE_SENTINEL_FILE = "paused";

export const INFLIGHT_DIR = "inflight";
export const INFLIGHT_TTL_MIN_MS = 600_000;

// Path resolvers — single source of truth for every state-file location.
// The hook never hard-codes these strings; it routes through these helpers.
export const pairRoot = (markerDir) => join(markerDir, PAIR_ROOT_DIR);
export const contextPath = (markerDir) => join(pairRoot(markerDir), CONTEXT_FILENAME);
export const ignorePath = (markerDir) => join(pairRoot(markerDir), IGNORE_FILENAME);
export const logPath = (markerDir) => join(pairRoot(markerDir), LOG_FILENAME);
export const cacheRoot = (markerDir) => join(pairRoot(markerDir), CACHE_DIR);
export const stateRoot = (markerDir) => join(pairRoot(markerDir), STATE_DIR);
export const pausePath = (markerDir) => join(stateRoot(markerDir), PAUSE_SENTINEL_FILE);
export const inflightRoot = (markerDir) => join(stateRoot(markerDir), INFLIGHT_DIR);

// ── Pause sentinel (ADR-085, paths consolidated per ADR-092) ─────────────
export function isPaused(markerDir) {
  try {
    statSync(pausePath(markerDir));
    return true;
  } catch {
    return false;
  }
}

// ── Inflight lock (ADR-087, paths consolidated per ADR-092) ──────────────
export function inflightLockPath(markerDir, filePath) {
  const hash = createHash("sha256").update(filePath).digest("hex").slice(0, 16);
  return join(inflightRoot(markerDir), hash);
}

export function tryAcquireInflightLock(markerDir, filePath, ttlMs) {
  const lockPath = inflightLockPath(markerDir, filePath);
  try {
    mkdirSync(dirname(lockPath), { recursive: true });
  } catch {
    // mkdir failures fall through — writeFileSync below will report the real error
  }
  try {
    writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    return { acquired: true, lockPath };
  } catch (err) {
    if (!err || err.code !== "EEXIST") {
      return { acquired: false, lockPath, reason: "error" };
    }
  }
  // Lock exists. Multi-review (ADR-091) caught a TOCTOU: a blind
  // unlink-after-stat can delete a FRESH lock that another concurrent
  // process wrote between our stat and our unlink. Defense: capture an
  // identity snapshot (mtime + PID content) before deciding the lock is
  // stale, then re-verify the identity right before unlinking. If
  // anyone refreshed it, treat as in-flight.
  let snapshot;
  try {
    const stats = statSync(lockPath);
    if (Date.now() - stats.mtimeMs <= ttlMs) {
      return { acquired: false, lockPath, reason: "in-flight" };
    }
    snapshot = { mtimeMs: stats.mtimeMs, pid: readFileSync(lockPath, "utf8") };
  } catch {
    // Lock vanished between EEXIST and stat — retry the create
    try {
      writeFileSync(lockPath, String(process.pid), { flag: "wx" });
      return { acquired: true, lockPath, recoveredStale: true };
    } catch {
      return { acquired: false, lockPath, reason: "race" };
    }
  }
  // Re-verify identity right before unlinking; if mtime or PID changed,
  // another actor refreshed the lock and we must back off.
  try {
    const recheck = statSync(lockPath);
    const recheckPid = readFileSync(lockPath, "utf8");
    if (recheck.mtimeMs !== snapshot.mtimeMs || recheckPid !== snapshot.pid) {
      return { acquired: false, lockPath, reason: "in-flight" };
    }
  } catch {
    // Vanished between snapshot and recheck — fall through to retry create
  }
  try {
    unlinkSync(lockPath);
  } catch {
    // someone else already cleaned up — fine, fall through to retry
  }
  try {
    writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    return { acquired: true, lockPath, recoveredStale: true };
  } catch {
    return { acquired: false, lockPath, reason: "race" };
  }
}

export function releaseInflightLock(lockPath) {
  if (!lockPath) return;
  try {
    unlinkSync(lockPath);
  } catch {
    // already gone — fine
  }
}

// ── Content-hash cache (ADR-082, atomic per ADR-086) ─────────────────────
export function computeCacheKey({ model, prompt, fileContent, surfaceThreshold }) {
  const h = createHash("sha256");
  h.update(model);
  h.update("\0");
  h.update(prompt);
  h.update("\0");
  h.update(fileContent);
  h.update("\0");
  h.update(surfaceThreshold);
  return h.digest("hex");
}

export function cachePathFor(markerDir, cacheKey) {
  return join(cacheRoot(markerDir), cacheKey.slice(0, 2), `${cacheKey.slice(2)}.json`);
}

export async function getCachedConcerns(markerDir, cacheKey) {
  const cachePath = cachePathFor(markerDir, cacheKey);
  try {
    const stats = await stat(cachePath);
    if (Date.now() - stats.mtimeMs > CACHE_TTL_MS) return null;
    const raw = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      !Array.isArray(parsed.high) ||
      !Array.isArray(parsed.med) ||
      !Array.isArray(parsed.low)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function setCachedConcerns(markerDir, cacheKey, value) {
  const cachePath = cachePathFor(markerDir, cacheKey);
  try {
    await mkdir(dirname(cachePath), { recursive: true });
    const tmpPath = `${cachePath}.tmp.${process.pid}`;
    await writeFile(tmpPath, JSON.stringify(value));
    await rename(tmpPath, cachePath);
  } catch {
    // intentional no-op — cache write failures must never break Claude's flow
  }
  await evictCacheOldest(markerDir);
}

export async function evictCacheOldest(markerDir) {
  try {
    const root = cacheRoot(markerDir);
    const entries = [];
    const prefixes = await readdir(root);
    for (const prefix of prefixes) {
      let files;
      try {
        files = await readdir(join(root, prefix));
      } catch {
        continue;
      }
      for (const file of files) {
        const full = join(root, prefix, file);
        try {
          const s = await stat(full);
          entries.push({ path: full, mtimeMs: s.mtimeMs });
        } catch {
          // skip unreadable entries
        }
      }
    }
    if (entries.length <= CACHE_MAX_ENTRIES) return;
    entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
    const drop = entries.slice(0, entries.length - CACHE_MAX_ENTRIES);
    for (const e of drop) {
      try {
        await unlink(e.path);
      } catch {
        // skip if already deleted by a concurrent run
      }
    }
  } catch {
    // intentional no-op — eviction is best-effort
  }
}

// ── Log (ADR-079 rotation + ADR-086 clamp + ADR-091 PID-scoped tmp) ──────
export async function rotateLogIfNeeded(targetLogPath) {
  try {
    const stats = await stat(targetLogPath);
    if (stats.size <= MAX_LOG_BYTES) return;
    const content = await readFile(targetLogPath, "utf8");
    const lines = content.split("\n").filter((l) => l.length > 0);
    if (lines.length <= MAX_LOG_ENTRIES) return;
    const tail = lines.slice(-MAX_LOG_ENTRIES);
    // PID-scoped tmp prevents concurrent rotations from torn-writing the
    // same tmp file (ADR-091).
    const tmpPath = `${targetLogPath}.tmp.${process.pid}`;
    await writeFile(tmpPath, `${tail.join("\n")}\n`);
    await rename(tmpPath, targetLogPath);
  } catch {
    // intentional no-op — rotation is best-effort
  }
}

export function clampReason(reason) {
  if (typeof reason !== "string") return reason;
  // Use UTF-8 BYTE length, not JS char length — ADR-086's PIPE_BUF (4096)
  // atomicity contract is in bytes. Multi-review (ADR-091) flagged that
  // multibyte reasons (Cyrillic identifiers, em-dashes, accented filenames
  // in codex stderr) would slip past a char-count threshold.
  const byteLen = Buffer.byteLength(reason, "utf8");
  if (byteLen <= MAX_LOG_REASON_BYTES) return reason;
  // Slice the UTF-8 buffer, backing off any continuation bytes (high bits
  // 10xxxxxx) so we don't cut mid-codepoint and produce a U+FFFD.
  const buf = Buffer.from(reason, "utf8");
  let end = MAX_LOG_REASON_BYTES;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  const dropped = byteLen - end;
  return `${buf.subarray(0, end).toString("utf8")}…(${dropped}b truncated)`;
}

export async function appendLog(markerDir, entry) {
  const target = logPath(markerDir);
  // Ensure .codex-pair/ exists. The hook's main flow normally migrates
  // first, so this is a defensive belt — fresh installs hit it once.
  try {
    await mkdir(dirname(target), { recursive: true });
  } catch {
    // ignore — appendFile will surface the real failure
  }
  const safe = entry?.reason !== undefined ? { ...entry, reason: clampReason(entry.reason) } : entry;
  try {
    await appendFile(target, `${JSON.stringify(safe)}\n`);
  } catch {
    // logging failures must never break Claude's flow
    return;
  }
  await rotateLogIfNeeded(target);
}

