# Development Workflow

Standard workflow for AI-assisted development on GableLBM.

## Phase 1: Load Context

1. Read `CLAUDE.md` for project conventions and tech stack
2. Read relevant specs from `docs/` based on the task:
   - `docs/architecture.md` — module boundaries and communication patterns
   - `docs/design-system.md` — UI colors, typography, component patterns
   - `docs/database-erd.md` — database schema and relationships

## Phase 2: Understand the Task

1. Break the task into concrete, implementable steps
2. Identify which modules are affected (Inventory, Sales, Finance, Logistics, PIM, etc.)
3. Check existing code patterns — find similar implementations to follow
4. Identify files that need to be created or modified

## Phase 3: Implement

For each step:

1. **Backend changes** (if applicable):
   - Add/modify SQL migrations in `backend/migrations/`
   - Implement repository layer (pgx queries)
   - Implement service layer (business logic)
   - Add HTTP handlers and register routes on the Chi router
   - Follow existing patterns in the same module

2. **Frontend changes** (if applicable):
   - Create/modify page components in `app/src/pages/`
   - Use existing UI components from `app/src/components/ui/`
   - Follow the design system (Industrial Dark theme, correct color tokens)
   - Use JetBrains Mono for all numerical data
   - Add routes in `app/src/App.tsx`

3. **Commit** each logical unit of work with a descriptive message

## Phase 4: Quality Checklist

Before marking work complete, verify:

- [ ] TypeScript compiles without errors (`cd app && npx tsc --noEmit`)
- [ ] Go builds without errors (`cd backend && go build ./...`)
- [ ] New database columns use correct types (UUID PKs, DECIMAL(19,4) for quantities)
- [ ] UI follows design system (correct colors, fonts, spacing)
- [ ] No hardcoded colors — use Tailwind tokens
- [ ] API endpoints follow REST conventions at `/api/v1/*`
- [ ] No secrets or API keys committed to code
