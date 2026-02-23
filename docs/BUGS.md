# Bug Reports

## Known Bugs (inherited from upstream)

### Deprecated `-p` flag causes error
- **Severity:** Critical
- **Upstream:** Issue #48, PRs #56, #43
- **Description:** Gemini CLI v0.23+ deprecated the `-p`/`--prompt` flag. Using it now produces "Cannot use both positional prompt and --prompt flag" error.
- **Fix:** Replace `-p` flag with positional argument (`-- <prompt>`)

### Windows ENOENT spawn errors
- **Severity:** High
- **Upstream:** Issues #28, #30, #40; PRs #23, #27, #41, #43
- **Description:** `child_process.spawn()` fails on Windows because `gemini` resolves to `gemini.cmd`. Needs `shell: true` option and proper argument escaping.

### Excessive token responses
- **Severity:** Medium
- **Upstream:** Issues #6, #26
- **Description:** MCP tool responses can exceed 45k tokens even for small prompts, consuming excessive context window.

### Missing changelog for v1.1.4
- **Severity:** Low
- **Upstream:** Issue #39
- **Description:** Published version has no release notes or changelog entry.
