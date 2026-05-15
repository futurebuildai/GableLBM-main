---
description: Triage a bug report, identify root cause, and produce a precise fix specification.
inputs: Bug description, PROJECT_STATE.md, relevant source files
outputs: FIX_SPEC.md
---

# Bug Triage Workflow

Use this when a contributor reports a bug in GableLBM.

---

## Step 1: Reproduce and Locate

1. Read the bug description carefully
2. Read the relevant source files: `backend/internal/[module]/service.go`, `repository.go`, `handler.go`
3. Run `grep -r "[relevant term]" backend/internal/` to find all related code
4. Check `backend/migrations/` for any schema issues
5. Check `app/src/` for frontend issues

---

## Step 2: Identify Root Cause

Determine:
- **Root cause type:** Logic error / Schema issue / Missing validation / Race condition / Off-by-one / Type mismatch
- **Where the bug lives:** Specific file and line range
- **Why it happens:** Exact condition that triggers the bug
- **Impact:** What data is corrupted or what behavior is wrong?

---

## Step 3: Write FIX_SPEC.md

```markdown
# Fix Specification

## Bug Summary
[One sentence: what goes wrong, when, for whom]

## Root Cause
**File:** `[path/to/file.go]`
**Lines:** [line range]
**Why:** [Exact explanation of the logic error]

## Fix
**Type:** Surgical (< 20 lines changed) / Moderate (< 100 lines) / Significant (> 100 lines)

**Changes:**
1. **`[file path]`**: [What to change and why]
2. **`[migration file]`** (if schema fix): [SQL change]

## Regression Test
**File:** `[test file]`
**Test name:** `Test[Name]_[BugScenario]`
```go
func Test[Name]_[BugScenario](t *testing.T) {
    // Arrange: set up the condition that triggered the bug
    // Act: trigger the operation
    // Assert: correct behavior (not the buggy behavior)
}
```

## Verification
[Command to run + expected output to confirm fix]

## Adjacent Risk
[Is there any risk this fix breaks adjacent behavior? What to check?]
```
