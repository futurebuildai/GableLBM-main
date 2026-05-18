---
name: L8 Revisions
description: Systematic resolution of findings from a Zero-Trust L8 Audit. Consumes the audit's findings manifest and applies fixes with enforced self-reflection after every task. Each finding follows a strict Fix → Verify → Reflect loop to guarantee L8-grade code quality.
---

# L8 Revisions — Post-Audit Resolution Protocol

## Philosophy

**Fix with the same rigor as the audit.** The L8 Audit found problems. This skill resolves them with zero shortcuts. After every single fix, you STOP, verify the fix worked, then critically reflect on whether the fix introduced any new issues. Only then move to the next finding.

**Self-Reflection is mandatory, not optional.** L8 quality means every change is examined from the perspective of a hostile reviewer who assumes your fix is wrong.

## Trigger

- `/l8-revisions` — resolve all findings from the last L8 audit
- "fix the audit findings" / "resolve the blockers" — natural language triggers

---

## Phase 0: Load Audit Findings

1. Read the findings manifest at `.agent/last_audit/findings.md`
2. Parse all findings by ID (`B1`, `B2`, `A1`, `A2`, ...)
3. If the file doesn't exist, STOP and tell the user: "No audit findings found. Run `/zero-trust-audit` first."
4. Read `CLAUDE.md` for project conventions

**Create a task tracker artifact** listing every finding as a checkbox:

```markdown
# L8 Revisions — Task Tracker

**Source Audit:** [audit_date from frontmatter]
**Thread:** [audit_thread from frontmatter]

## Blockers (must resolve)
- [ ] B1: [title]
- [ ] B2: [title]

## Advisories (should resolve)
- [ ] A1: [title]
- [ ] A2: [title]
```

---

## Phase 1: Resolve Blockers (Sequential, Mandatory)

Process EVERY blocker in order (`B1`, `B2`, ...). For each:

### Step 1: Understand
- Read the finding's `Description`, `Evidence`, and `Files`
- Open and READ every file listed in `Files` — do not assume you know the code
- Understand the root cause — WHY does this problem exist?

### Step 2: Plan
- State your plan in 1-3 sentences BEFORE writing any code
- If the finding offers multiple fix options, choose the one that:
  1. Adds the least complexity
  2. Follows existing codebase patterns
  3. Is testable/verifiable

### Step 3: Fix
- Implement the fix
- Follow project conventions from `CLAUDE.md` exactly
- Keep changes minimal — fix the finding, don't refactor adjacent code

### Step 4: Verify (MANDATORY — DO NOT SKIP)
- Run the EXACT verification command from the finding's `Verification` field
- Run `go build ./...` (always, after every Go change)
- Copy the command output as evidence
- If verification FAILS, go back to Step 3. Do NOT proceed

### Step 5: Self-Reflect (MANDATORY — DO NOT SKIP)

After the fix passes verification, answer ALL of these questions honestly:

> **REFLECTION CHECKLIST:**
>
> 1. **Did I actually fix the root cause, or just the symptom?**
>    - If the finding was about a missing method, did I implement the method correctly with proper error handling — or did I just add a stub?
>
> 2. **Did my fix introduce any new issues?**
>    - New compiler errors? Run `go build ./...` and `go vet ./...` to check.
>    - New unused imports? New dead code?
>    - Did I break any existing tests? Run `go test ./...` on the affected package.
>
> 3. **Does my fix follow project conventions?**
>    - Error messages lowercase without punctuation (Go)
>    - Parameterized SQL queries (never string concat)
>    - Context propagation (`ctx context.Context` first param)
>    - Optional services nil-guarded
>
> 4. **Would this fix survive the L8 audit itself?**
>    - If I ran the audit phases against my fix, would it pass Phases 3-7?
>
> 5. **Is the fix complete, or did I leave loose ends?**
>    - Any TODOs I added? Are they justified?
>    - Any test updates needed?

**Record the reflection answers in the task tracker artifact** under the finding's checkbox. Then mark the finding as `[x]` complete.

If reflection reveals a problem → fix it before proceeding. Do NOT accumulate debt.

---

## Phase 2: Resolve Advisories (Sequential, Thorough)

Process EVERY advisory in order (`A1`, `A2`, ...). Same 5-step loop:

**Understand → Plan → Fix → Verify → Reflect**

Advisories deserve the same rigor — they were flagged for a reason.

The only difference: if an advisory's `Fix Guidance` explicitly says to defer (e.g., "defer to a future sprint"), then:
- Add the recommended comment/TODO to the code
- Verify the comment exists
- Mark as `[x] Deferred — [reason]` in the task tracker
- Still do the reflection step

---

## Phase 3: Final Validation

After ALL findings are resolved:

// turbo
1. Run `cd backend && go build ./...` — must exit 0
// turbo
2. Run `cd backend && go vet ./...` — record output
// turbo
3. Run `cd app && npx tsc --noEmit --skipLibCheck 2>&1 || echo "SKIP: tsc not available"` — record output
// turbo
4. Run `git diff --stat HEAD` — show total change impact

5. Produce a **Revision Summary** artifact:

```markdown
# L8 Revision Summary

**Date:** [ISO timestamp]
**Findings Resolved:** [N blockers, N advisories]
**Findings Deferred:** [N, with justification]

## Changes Made

| Finding | Fix Applied | Verification |
|---------|------------|-------------|
| B1 | [1-line summary] | ✅ `go build` passes |
| A1 | [1-line summary] | ✅ grep confirms fix |
| ... | ... | ... |

## Final Build Status
- `go build ./...`: [PASS/FAIL]
- `go vet ./...`: [PASS/FAIL + any pre-existing notes]
- `tsc --noEmit`: [PASS/FAIL/SKIP]

## Self-Assessment
[2-3 sentences: Are all fixes production-ready? Any remaining concerns?]
```

6. Update the findings manifest `.agent/last_audit/findings.md` frontmatter to:
   ```yaml
   overall_verdict: RESOLVED
   resolved_date: [ISO timestamp]
   resolved_by: [agent name]
   ```

---

## Critical Rules

1. **NEVER skip verification.** If a command isn't available (e.g., tsc), document it as SKIPPED — do NOT claim PASS.
2. **NEVER skip reflection.** Even for trivial fixes. Especially for trivial fixes. Trivial fixes are where bugs hide.
3. **ONE finding at a time.** Do not batch fixes. Fix B1, verify B1, reflect on B1, then move to B2.
4. **Minimal changes.** Fix the finding. Don't refactor, don't "improve" adjacent code, don't add features.
5. **Evidence over assertions.** Paste command output. Don't say "it compiles" — show the output.
6. **If you're unsure, stop and ask.** Don't guess. Flag it for the user.
