---
stage: "08"
description: Define a complete testing strategy covering Go unit tests, API integration tests, and frontend component tests — all derived from the PRD's acceptance criteria.
inputs: PRD.md, ARCHITECTURE.md, API_CONTRACT.md
outputs: TESTING_STRATEGY.md
---

# Stage 08: Testing Strategy

Define exactly what to test and how to test it. Every Must Have acceptance criterion in the PRD maps to at least one test.

---

## Step 1: Read Prior Artifacts

Read `PRD.md` (every Gherkin scenario), `ARCHITECTURE.md` (Go interfaces and service methods), `API_CONTRACT.md` (all endpoints).

---

## Step 2: Write the Testing Strategy

Write `.agents/handoff/TESTING_STRATEGY.md`:

```markdown
# Testing Strategy
# Feature: [Feature Name]

---

## 1. Backend Unit Tests

**File:** `backend/internal/[module]/service_test.go`
**Framework:** Go standard `testing` package
**Pattern:** Test the service layer with a mock repository

### Test Cases

#### [ServiceMethod] — Happy Path
```go
func Test[ServiceMethod]_Success(t *testing.T) {
    // Arrange: mock repository returns [expected data]
    // Act: call service.[Method]
    // Assert: result matches expected, no error
}
```

#### [ServiceMethod] — [Edge Case]
```go
func Test[ServiceMethod]_[EdgeCase](t *testing.T) {
    // Arrange: [edge condition]
    // Act: call service.[Method]
    // Assert: [expected behavior — error or modified result]
}
```

[Map each Gherkin scenario to a test function. Minimum: happy path + every error scenario.]

---

## 2. API Integration Tests

**File:** `backend/internal/[module]/handler_test.go`
**Framework:** `net/http/httptest` — no external dependencies
**Pattern:** Spin up a test router with a real (test) database connection

### Test Cases

#### [ENDPOINT] — Happy Path
```go
func Test[Handler]_[Method]_Success(t *testing.T) {
    // Arrange: seed test DB with required data
    // Act: POST/GET/PUT to /api/v1/[resource]
    // Assert: HTTP 200/201, response body matches API_CONTRACT.md schema
}
```

#### [ENDPOINT] — Validation Failure
```go
func Test[Handler]_[Method]_ValidationError(t *testing.T) {
    // Arrange: request with missing/invalid fields
    // Act: send request
    // Assert: HTTP 400, error message matches API_CONTRACT.md
}
```

#### [ENDPOINT] — Not Found
```go
func Test[Handler]_[Method]_NotFound(t *testing.T) {
    // Arrange: non-existent ID
    // Act: GET /api/v1/[resource]/nonexistent-uuid
    // Assert: HTTP 404
}
```

---

## 3. Frontend Component Tests

**File:** `app/src/components/[name]/gable-[name].test.ts`
**Framework:** Vitest + @web/test-runner

### Test Cases

For each new `gable-*` component:

#### Renders with data
```typescript
it('renders [component] with data', async () => {
  // Mount component with mock data
  // Assert: key elements are visible with correct content
  // Assert: JetBrains Mono on all numeric values
});
```

#### Empty state
```typescript
it('shows empty state when no data', async () => {
  // Mount with empty/null data
  // Assert: empty state message is visible
});
```

#### User interaction
```typescript
it('[action] triggers [outcome]', async () => {
  // Mount component
  // Simulate user click/input
  // Assert: expected event fired or DOM change
});
```

---

## 4. Data Integrity Tests

[For financial features: verify that ledger entries balance, quantities reconcile, etc.]

```go
func Test[Feature]_DataIntegrity(t *testing.T) {
    // Arrange: perform the full workflow
    // Assert: [financial totals balance / inventory levels correct / audit log entries present]
}
```

---

## 5. Regression Checklist

Tests to run against adjacent modules to confirm no regressions:
| Module | Test File | What to Verify |
|--------|----------|----------------|
| [Adjacent module] | `backend/internal/[module]/service_test.go` | [Specific behavior that might break] |

---

## 6. Running Tests
```bash
# Backend unit + integration tests
cd backend && go test ./internal/[module]/... -v

# All backend tests (regression check)
cd backend && go test ./...

# Frontend component tests
cd app && npm run test
```
```

---

## Step 3: Update Pipeline State

```
- [x] 08 Testing Strategy
Artifacts: TESTING_STRATEGY.md
Backend test cases: [N]
API test cases: [N]
Frontend test cases: [N]
```

Proceed immediately to Stage 09.
