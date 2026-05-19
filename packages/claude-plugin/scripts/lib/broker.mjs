// App-server broker interface (ADR-090).
//
// Future home of the long-lived codex sidecar that replaces per-edit cold
// spawns with persistent JSON-RPC requests. Today this module defines the
// API surface and stable state-file layout — the implementation lands as
// Tier 3 follow-on work tracked in docs/ROADMAP.md.
//
// **Status:** interface defined; implementation deferred. The `isBrokerEnabled`
// check returns false until ASK_CODEX_BROKER=1 ships alongside a real
// implementation. The hook MUST treat broker absence as a no-op and fall
// back to the existing per-edit codex spawn (ADR-077). This keeps the
// happy path byte-identical to v0.6.6 until the broker stabilizes.
//
// See ADR-090 for design rationale: transport choice (unix:// on POSIX,
// ws:// on Windows), lifecycle ownership (SessionStart spawns, SessionEnd
// or process-exit teardown), health protocol, failure modes, and the
// stale-daemon recovery strategy.

import { statSync } from "node:fs";
import { join } from "node:path";

export const BROKER_STATE_FILE = "broker.json";
export const BROKER_HEALTH_TIMEOUT_MS = 2000;
export const BROKER_SOCKET_PREFIX = "codex-pair-broker";

// Single source of truth for "is the broker active for this project right
// now". Reads .codex-pair-state/broker.json and returns the broker descriptor
// (transport URL, pid, started_at, codex version) or null if no broker is
// running. The hook's main flow checks this BEFORE the cache + inflight
// lock; a live broker bypasses both because the broker itself coordinates
// concurrent requests.
//
// The implementation is intentionally stubbed for v0.6.6. Returning null
// here causes every hook invocation to fall through to the existing
// per-edit spawn path — byte-identical behavior to pre-broker.
export function readBrokerState(_markerDir) {
  return null;
}

// Stable predicate the hook can call without knowing the broker mechanics.
// Returns true iff (a) ASK_CODEX_BROKER=1 in env, (b) readBrokerState
// returns a non-null descriptor, (c) the broker process is alive AND
// answered a health probe within BROKER_HEALTH_TIMEOUT_MS. Today (b) is
// stubbed to null, so this is always false.
export function isBrokerEnabled(markerDir) {
  if (process.env.ASK_CODEX_BROKER !== "1") return false;
  const state = readBrokerState(markerDir);
  if (!state) return false;
  return false; // implementation deferred — see ADR-090
}

// Path resolver for the per-marker-dir broker state file. Used by the
// SessionStart hook (writer) and the per-edit hook (reader).
export function brokerStatePath(markerDir, stateDir) {
  return join(markerDir, stateDir, BROKER_STATE_FILE);
}

// Stale-state cleanup helper. SessionStart calls this before launching a
// fresh broker; the per-edit hook MAY call it on startup as a belt-and-
// suspenders defense (but the SessionStart path is the contract).
// Implementation deferred.
export function clearStaleBrokerState(_markerDir) {
  // Read .codex-pair-state/broker.json; if pid is dead OR socket is gone
  // OR codex version doesn't match the recorded one, unlink the state
  // file so the next request falls through to a fresh spawn or a fresh
  // broker launch (per the configured policy).
}

// Health-probe stub. Real implementation will open the transport (unix
// socket or websocket), send a `ping` request, wait up to
// BROKER_HEALTH_TIMEOUT_MS for a `pong`, and return boolean.
export async function probeBrokerHealth(_state) {
  return false;
}

// Submit-review API stub. The hook calls this when isBrokerEnabled
// returns true. Today never reached. Real implementation will send a
// JSON-RPC request over the broker's transport with the rendered prompt
// + the standard codex parameters, and return the same agent_message
// shape spawnCodex currently returns.
export async function submitReview(_state, _prompt, _options) {
  throw new Error("Broker submitReview not implemented yet — see ADR-090");
}
