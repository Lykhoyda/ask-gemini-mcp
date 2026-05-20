// Broker lifecycle: spawn `codex app-server`, poll readiness, handshake,
// atomic descriptor write. SessionStart calls `bootstrapBroker`; SessionEnd
// will call the symmetric teardown helpers (Milestone 2 PR 3).
//
// Per ADR-090 + ADR-093 + the brainstorm-coordinator's verified findings:
// the broker uses RFC 6455 WebSocket framing on BOTH `unix://` and `ws://`
// transports; readiness is `initialize` round-trip success, not socket
// existence; descriptor must be written ATOMICALLY only after `initialize`
// succeeds (no partial-broker states observable from the hook side per
// ADR-077). Wall-clock budget enforced on the whole bootstrap; on
// exhaustion or any failure path, the spawned child is terminated and
// the hook exits 0 silently.
//
// Pure Node built-ins + relative `./broker-*.mjs` imports per ADR-078.

import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, openSync, rmSync, statSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { connect as netConnect } from "node:net";
import { platform } from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeBroker } from "./broker.mjs";
import { terminateProcessTree, IS_WINDOWS } from "./process.mjs";
import { stateRoot } from "./state.mjs";

// Locks live alongside the broker descriptor. Per-marker-dir isolation is
// inherent because the parent path is `<markerDir>/.codex-pair/state/`.
const BROKER_LOCK_DIR = "broker.lock";
const BROKER_LOG_FILE = "broker.log";
const BROKER_SOCKET_PREFIX = "codex-pair-broker";
const BOOTSTRAP_BUDGET_MS_DEFAULT = 5000;
const SOCKET_POLL_INTERVAL_MS = 100;

// Choose the transport URL for this marker directory. POSIX: unix socket
// under `<markerDir>/.codex-pair/state/`, with sha256-of-markerDir suffix
// to prevent name collisions across symlinked project trees. Windows:
// TODO — codex CLI supports `ws://IP:PORT` but cross-platform port
// reservation has a known race (Brainstorm Risk #3). Punted to a follow-on
// PR; for Milestone 2 we throw on Windows and the hook treats it as a
// bootstrap failure (silent exit per ADR-077).
export function chooseTransport(markerDir) {
  if (IS_WINDOWS) {
    throw new Error("broker-lifecycle: Windows transport not implemented yet (see ADR-090)");
  }
  const hash = createHash("sha256").update(markerDir).digest("hex").slice(0, 8);
  const socketPath = join(stateRoot(markerDir), `${BROKER_SOCKET_PREFIX}.${hash}.sock`);
  return `unix://${socketPath}`;
}

// Path resolvers for the lifecycle's filesystem state.
export function brokerLockPath(markerDir) {
  return join(stateRoot(markerDir), BROKER_LOCK_DIR);
}

export function brokerLogPath(markerDir) {
  return join(stateRoot(markerDir), BROKER_LOG_FILE);
}

// Atomic lock via mkdir(2). The mkdir syscall is atomic across all POSIX
// filesystems we care about (and on Windows). On success, returns the
// lock path; on EEXIST, returns null (another SessionStart already
// holding the lock — caller should exit quietly).
export function acquireBrokerLock(markerDir) {
  const lockPath = brokerLockPath(markerDir);
  try {
    mkdirSync(stateRoot(markerDir), { recursive: true });
    mkdirSync(lockPath);
    return lockPath;
  } catch (err) {
    if (err && err.code === "EEXIST") return null;
    throw err;
  }
}

export function releaseBrokerLock(lockPath) {
  if (!lockPath) return;
  try {
    // Lock is a directory created by mkdirSync (so mkdir(2) acted as our
    // atomic primitive). To remove a directory we need recursive:true on
    // rmSync — recursive:false throws even with force:true (force only
    // suppresses ENOENT, not EISDIR).
    rmSync(lockPath, { recursive: true, force: true });
  } catch {
    // Best-effort. A stuck lock will be cleared by stale-recovery at
    // next SessionStart (Milestone 2 PR 3 / Milestone 4).
  }
}

// Poll the transport for reachability. Different probes per scheme:
//   - unix:// — check the socket file exists + try net.connect once
//   - ws://   — try net.connect to host:port
// Returns true on first reachable response, false after the budget. The
// caller still has to perform `initialize` separately — reachability is
// necessary but not sufficient for "broker is healthy" per ADR-093.
export async function pollSocketReachable(transportUrl, budgetMs) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const reachable = await probeOnce(transportUrl);
    if (reachable) return true;
    await sleep(SOCKET_POLL_INTERVAL_MS);
  }
  return false;
}

function probeOnce(transportUrl) {
  return new Promise((resolve) => {
    let connectOptions;
    if (transportUrl.startsWith("unix://")) {
      const path = transportUrl.slice("unix://".length);
      try {
        statSync(path);
      } catch {
        resolve(false);
        return;
      }
      connectOptions = { path };
    } else if (transportUrl.startsWith("ws://")) {
      const rest = transportUrl.slice("ws://".length);
      const slashIdx = rest.indexOf("/");
      const authority = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
      const colonIdx = authority.lastIndexOf(":");
      const host = colonIdx === -1 ? authority : authority.slice(0, colonIdx);
      const port = colonIdx === -1 ? 80 : Number(authority.slice(colonIdx + 1));
      connectOptions = { host, port };
    } else {
      resolve(false);
      return;
    }
    const sock = netConnect(connectOptions);
    const settle = (ok) => {
      sock.removeAllListeners();
      try {
        sock.destroy();
      } catch {}
      resolve(ok);
    };
    sock.once("connect", () => settle(true));
    sock.once("error", () => settle(false));
    sock.once("timeout", () => settle(false));
    sock.setTimeout(SOCKET_POLL_INTERVAL_MS);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms).unref?.());
}

// Spawn `codex app-server --listen <transport>` detached so it outlives
// SessionStart's process. stdio is redirected to broker.log (open via
// O_APPEND so multiple writers — unlikely but defensive — don't tear).
// Returns the spawned ChildProcess; caller is responsible for tracking
// the pid and writing it to the descriptor only after handshake succeeds.
export function spawnBroker(markerDir, transportUrl) {
  const logFd = openSync(brokerLogPath(markerDir), "a");
  const child = spawn("codex", ["app-server", "--listen", transportUrl], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  // detached + unref so SessionStart can exit cleanly without waiting
  // for the broker. The broker stays alive as a session-scoped daemon.
  child.unref();
  return child;
}

// Codex version detection. Best-effort: returns the version string or
// "unknown" if codex isn't on PATH or fails. Used in the descriptor for
// version-skew detection (stale-broker recovery, Milestone 4).
export function readCodexVersion() {
  try {
    const out = execFileSync("codex", ["--version"], { timeout: 2000, encoding: "utf-8" });
    return (out || "").trim() || "unknown";
  } catch {
    return "unknown";
  }
}

// Atomic descriptor write via tmp+rename (ADR-086). Caller ensures
// stateRoot(markerDir) exists (acquireBrokerLock creates it).
export async function writeBrokerDescriptor(markerDir, descriptor) {
  const finalPath = join(stateRoot(markerDir), "broker.json");
  const tmpPath = `${finalPath}.tmp.${process.pid}`;
  await writeFile(tmpPath, JSON.stringify(descriptor, null, 2));
  await rename(tmpPath, finalPath);
  return finalPath;
}

export async function unlinkBrokerDescriptor(markerDir) {
  const finalPath = join(stateRoot(markerDir), "broker.json");
  try {
    await unlink(finalPath);
  } catch {
    // best-effort
  }
}

// Resolve the plugin version from package.json. Used in clientInfo.title
// and the descriptor. Falls back to "unknown" if the manifest can't be
// read (the bundled marketplace install ships package.json adjacent to
// scripts/).
let cachedPluginVersion = null;
export function readPluginVersion() {
  if (cachedPluginVersion) return cachedPluginVersion;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // scripts/lib/*.mjs → packages/claude-plugin/package.json
    const manifest = join(here, "..", "..", "package.json");
    // Synchronous read because this is a one-shot startup cost.
    // biome-ignore lint/style/useNodejsImportProtocol: ESM dynamic
    const fs = require("node:fs");
    const text = fs.readFileSync(manifest, "utf-8");
    cachedPluginVersion = (JSON.parse(text)?.version || "unknown").trim();
  } catch {
    cachedPluginVersion = "unknown";
  }
  return cachedPluginVersion;
}

// Full bootstrap orchestrator. Acquires lock, spawns broker, polls for
// socket reachability, performs initialize handshake, writes descriptor
// atomically. Enforces wall-clock budget. On ANY failure, terminates
// the spawned child + releases the lock + returns null (caller exits 0
// per ADR-077). On success, returns the descriptor object that was
// written + closes the initialize connection (long-lived RPC is the
// per-edit hook's responsibility, not SessionStart's).
//
// Options:
//   - budgetMs (default 5000) — total wall-clock budget for spawn+poll+
//     initialize. Exhaustion = treated as failure.
//   - injectDeps — testing hook to inject mocked spawn / initializeBroker
//     for unit tests. Real production calls leave this undefined.
export async function bootstrapBroker(markerDir, options = {}) {
  const { budgetMs = BOOTSTRAP_BUDGET_MS_DEFAULT, injectDeps } = options;
  const spawnFn = injectDeps?.spawnBroker ?? spawnBroker;
  const initFn = injectDeps?.initializeBroker ?? initializeBroker;
  const pollFn = injectDeps?.pollSocketReachable ?? pollSocketReachable;
  const versionFn = injectDeps?.readCodexVersion ?? readCodexVersion;

  const lockPath = acquireBrokerLock(markerDir);
  if (!lockPath) return null; // another SessionStart holds the lock

  const deadline = Date.now() + budgetMs;
  let child = null;
  try {
    const transportUrl = chooseTransport(markerDir);
    child = spawnFn(markerDir, transportUrl);

    const pollBudget = Math.max(100, deadline - Date.now() - 1000);
    const reachable = await pollFn(transportUrl, pollBudget);
    if (!reachable) throw new Error("broker did not become reachable within budget");

    const remaining = Math.max(500, deadline - Date.now());
    const clientInfo = {
      name: "codex-pair",
      title: `codex-pair plugin v${readPluginVersion()}`,
      version: readPluginVersion(),
    };
    const { connection, initializeResult } = await initFn(transportUrl, clientInfo, {
      handshakeTimeoutMs: remaining,
      initializeTimeoutMs: remaining,
    });

    const descriptor = {
      pid: child.pid,
      transportUrl,
      codexVersion: versionFn(),
      codexHome: initializeResult?.codexHome ?? null,
      protocolVersion: "v2", // matches BROKER_PROTOCOL_VERSION in broker.mjs
      pluginVersion: readPluginVersion(),
      startedAt: new Date().toISOString(),
      logPath: brokerLogPath(markerDir),
    };
    await writeBrokerDescriptor(markerDir, descriptor);

    // Close the bootstrap connection — the per-edit hook opens its own
    // long-lived RPC connection (Milestone 4).
    try {
      connection.close(1000, "bootstrap done");
    } catch {
      // best-effort
    }

    return descriptor;
  } catch {
    // ADR-077 silent-on-error. Tear down the child (best-effort) and
    // signal failure to the caller via null return.
    if (child) {
      try {
        terminateProcessTree(child, "SIGTERM");
      } catch {}
    }
    return null;
  } finally {
    releaseBrokerLock(lockPath);
  }
}

// Test-only exports
export const __testing__ = {
  BROKER_LOCK_DIR,
  BROKER_LOG_FILE,
  BROKER_SOCKET_PREFIX,
  BOOTSTRAP_BUDGET_MS_DEFAULT,
};
