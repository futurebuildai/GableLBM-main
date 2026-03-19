# GableLBM

An open-source ERP platform built specifically for lumber and building materials (LBM) dealers. GableLBM replaces legacy systems like Epicor BisTrack, ECI Spruce, and DMSi Agility with a modern, AI-native platform.

## Project Structure

```
app/          Frontend (React + TypeScript + Tailwind)
backend/      Backend API (Go + PostgreSQL)
docs/         Architecture and design specifications
```

---

## Prerequisites

Before you start, make sure you have the following installed on your computer:

| Tool | Version | What it does |
|------|---------|-------------|
| **Node.js** | 20 or newer | Runs the frontend |
| **npm** | Comes with Node.js | Installs frontend packages |
| **Go** | 1.24 or newer | Runs the backend |
| **PostgreSQL** | 16 or newer | The database |
| **Git** | Any recent version | Version control |

### How to check if you have them

Open your terminal (Terminal on Mac, Command Prompt or PowerShell on Windows) and run:

```bash
node --version    # Should show v20.x.x or higher
go version        # Should show go1.24.x or higher
psql --version    # Should show 16.x or higher
git --version     # Any version is fine
```

If any of these are missing, install them from:
- Node.js: https://nodejs.org
- Go: https://go.dev/dl
- PostgreSQL: https://www.postgresql.org/download
- Git: https://git-scm.com/downloads

---

## Local Development Setup

### Step 1: Clone the repository

```bash
git clone git@github.com:futurebuildai/GableLBM-main.git
cd GableLBM-main
```

### Step 2: Set up the database

Open your terminal and create a PostgreSQL database:

```bash
# Connect to PostgreSQL (you may need to use 'sudo -u postgres psql' on Linux)
psql -U postgres

# Inside the PostgreSQL prompt, run these commands:
CREATE USER gable_user WITH PASSWORD 'gable_password';
CREATE DATABASE gable_db OWNER gable_user;
\q
```

Then run the database migrations:

```bash
cd backend
go run ./cmd/migrate
```

### Step 3: Start the backend

```bash
cd backend
go run ./cmd/server
```

The backend will start on **http://localhost:8080**.

By default it connects to `postgres://gable_user:gable_password@localhost:5434/gable_db`. If your PostgreSQL runs on a different port (the default is usually 5432), set the connection string:

```bash
DATABASE_URL="postgres://gable_user:gable_password@localhost:5432/gable_db?sslmode=disable" go run ./cmd/server
```

### Step 4: Start the frontend

Open a **new terminal window** (keep the backend running in the other one):

```bash
cd app
npm install
npm run dev
```

The frontend will start on **http://localhost:5173**. Open this URL in your browser.

---

## Contributing

We welcome contributions from everyone. Here's how to contribute step by step.

### Branch Structure

| Branch | Purpose | Who can merge |
|--------|---------|--------------|
| `master` | Production-ready code | futurebuildai only |
| `staging` | Pre-production testing | futurebuildai only |
| `community` | Community contributions land here | Open to PRs |

### How to contribute

**1. Clone the repo** (if you haven't already):

```bash
git clone git@github.com:futurebuildai/GableLBM-main.git
cd GableLBM-main
```

**2. Create a new branch** for your changes:

```bash
# Give your branch a descriptive name
git checkout -b my-feature-name
```

**3. Make your changes** using your code editor of choice.

**4. Commit your changes:**

```bash
# Stage your changed files
git add .

# Write a short description of what you changed
git commit -m "Add feature: description of what you did"
```

**5. Push your branch** to GitHub:

```bash
git push origin my-feature-name
```

**6. Open a Pull Request:**
- Go to https://github.com/futurebuildai/GableLBM-main
- You'll see a banner saying your branch was recently pushed
- Click **"Compare & pull request"**
- Make sure the **base branch** is set to `community` (not master)
- Add a title and description of your changes
- Click **"Create pull request"**

That's it. The maintainers will review your PR and provide feedback.

---

## Working with AI Agents

GableLBM is designed to be developed with the help of AI coding agents. Here's how to set them up.

### Option A: Claude Code

Claude Code is a command-line AI assistant that can read your codebase, make changes, and run commands.

**1. Install Claude Code:**

```bash
npm install -g @anthropic-ai/claude-code
```

**2. Navigate to the project and start Claude:**

```bash
cd GableLBM-main
claude
```

Claude automatically reads the `CLAUDE.md` file at the root of the project. This file contains all the project conventions, tech stack details, and patterns that Claude needs to understand the codebase.

**3. Example workflow:**

Once Claude is running, you can ask it things like:
- "Add a new API endpoint for vendor contacts"
- "Fix the bug where invoice totals don't update"
- "Create a new page for purchase order analytics"

Claude will analyze the codebase, propose a plan, and implement the changes after your approval.

### Option B: Antigravity (Cursor)

Antigravity is an agent-based development workflow designed for Cursor IDE.

**1. Install Cursor** from https://cursor.com

**2. Open the project:**

```bash
# Open in Cursor from the terminal
cursor GableLBM-main
```

**3. How it works:**

Cursor reads the `CLAUDE.md` file and the `.agent/workflows/` directory for context. The workflow is:

1. Define what you want to build (describe the feature or fix)
2. The agent reads the specs in `docs/` to understand the architecture
3. It implements the changes following project conventions
4. You review and approve the changes

The `.agent/workflows/development.md` file contains the standard development workflow that Antigravity follows.

---

## Detailed Documentation

| Document | Description |
|----------|-------------|
| `CLAUDE.md` | Project conventions and quick reference for AI agents |
| `docs/architecture.md` | System architecture, module boundaries, tech stack |
| `docs/design-system.md` | Colors, typography, component patterns |
| `docs/database-erd.md` | Full database schema with ERD diagrams |

---

## Environment Variables

The backend uses environment variables for configuration. All are optional except the database connection:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Backend server port |
| `DATABASE_URL` | `postgres://gable_user:gable_password@localhost:5434/gable_db?sslmode=disable` | PostgreSQL connection |
| `ANTHROPIC_API_KEY` | — | Claude AI for content generation |
| `GEMINI_API_KEY` | — | Google Gemini for image generation |
| `GOOGLE_MAPS_API_KEY` | — | Maps for delivery routing |

AI API keys can also be configured through the Admin UI at runtime (stored in the database).

---

## License

See [LICENSE](LICENSE) for details.
