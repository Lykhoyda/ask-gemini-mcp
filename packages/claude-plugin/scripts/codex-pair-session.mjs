#!/usr/bin/env node
// SessionStart / SessionEnd hook for the codex-pair app-server broker
// (ADR-090). Today this is a stub: invocation reads stdin (Claude Code's
// hook protocol), inspects the event type, and exits 0 silently.
//
// When the broker implementation lands (Tier 3 follow-on):
//   - SessionStart: walk up from cwd to find .codex-pair-context.md.
//     If found, spawn `codex app-server --listen <transport>` and write
//     the descriptor to .codex-pair-state/broker.json (atomic via
//     tmp+rename, per ADR-086).
//   - SessionEnd: read .codex-pair-state/broker.json. If a broker is
//     recorded, send it a graceful shutdown request, wait briefly, then
//     terminateProcessTree on the pid. Unlink the state file and the
//     transport socket.
//
// The hook MUST exit 0 on every path. A broker spawn failure is logged
// but doesn't break the session — the hook's main per-edit path keeps
// working with per-edit spawns.

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (c) => {
      data += c.toString();
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
  });
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const event = payload?.hook_event_name;
  if (event !== "SessionStart" && event !== "SessionEnd") {
    process.exit(0);
  }

  // Broker is disabled until ASK_CODEX_BROKER=1 ships with a real
  // implementation. This is a deliberate gating per ADR-090's "land the
  // ADR + interface; defer implementation" decision.
  if (process.env.ASK_CODEX_BROKER !== "1") {
    process.exit(0);
  }

  // TODO(ADR-090 follow-on): spawn/teardown the codex app-server broker
  // per the design. See lib/broker.mjs for the planned API surface.
  process.exit(0);
}

main().catch(() => process.exit(0));
