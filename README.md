# FinMate

FinMate is an Nx monorepo that contains:

- `frontend`: Angular application
- `backend`: NestJS API
- `shared/data-models`: shared TypeScript models and types
- `docker-compose.yml`: local PostgreSQL and Redis services

This README is written for new developers and explains every setup command from start to finish.

## Prerequisites

Install these tools first:

- Node.js LTS (recommended 20+)
- npm (bundled with Node.js)
- Docker Desktop
- Git

Verify installation:

```bash
node -v
npm -v
docker --version
git --version
```

## Setup Flow A: Build This Workspace From Scratch

Use this only when creating a new workspace from zero.

### 1) Create the Nx workspace

```bash
npx create-nx-workspace@latest finmate --preset=apps --packageManager=npm
```

What this does:

- Creates a new monorepo folder named `finmate`
- Initializes Nx configuration and root `package.json`
- Sets npm as the package manager

### 2) Move into the workspace

```bash
cd finmate
```

What this does:

- Changes your terminal context to the project root for all future commands

### 3) Generate Angular frontend app

```bash
npx nx g @nx/angular:app frontend --style=scss --routing=true --standalone=true
```

What this does:

- Creates Angular app `frontend`
- Enables SCSS styling
- Enables Angular routing
- Uses standalone component architecture

### 4) Generate NestJS backend app

```bash
npx nx g @nx/nest:app backend --frontendProject=frontend
```

What this does:

- Creates Nest app `backend`
- Adds backend project targets in Nx (serve/build/test/lint)

### 5) Install Fastify platform for Nest

```bash
npm install @nestjs/platform-fastify
```

What this does:

- Adds Fastify adapter package so backend can run on Fastify

### 6) Generate shared models library

```bash
npx nx g @nx/js:lib shared/data-models --bundler=tsc
```

What this does:

- Creates a shared TypeScript library for DTOs/interfaces/constants used by frontend and backend

## Setup Flow B: New Developer Joining Existing Repo

Use this flow when the repository already exists and you are setting up locally.

### 1) Clone and open the repository

```bash
git clone <repo-url>
cd FinMate
```

What this does:

- Downloads the repository code
- Moves into the project root

### 2) Install project dependencies

```bash
npm install
```

What this does:

- Installs all workspace dependencies from `package.json`
- Generates `node_modules`

### 3) Create local environment file

Use your shell to create `.env.dev` in project root.

PowerShell:

```powershell
Set-Content .env.dev "DATABASE_URL=postgresql://finmate_user:finmate_password@localhost:5432/finmate_dev"
Add-Content .env.dev "REDIS_URL=redis://localhost:6379"
Add-Content .env.dev "NODE_ENV=development"
Add-Content .env.dev "PORT=3000"
```

What this does:

- Defines local backend connection settings for PostgreSQL and Redis

## Docker Setup (PostgreSQL + Redis)

The file `docker-compose.yml` defines two services:

- `postgres` on port `5432`
- `redis` on port `6379`

### 1) Start infrastructure

```bash
docker-compose up -d
```

What this does:

- Pulls images if missing
- Starts containers in detached mode
- Creates volumes `postgres_data` and `redis_data`

### 2) Verify service status

```bash
docker-compose ps
```

What this does:

- Shows whether `postgres` and `redis` are up and healthy

### 3) View logs for troubleshooting

```bash
docker-compose logs postgres
docker-compose logs redis
```

What this does:

- Prints container logs to help diagnose startup/health issues

### 4) Stop infrastructure

```bash
docker-compose down
```

What this does:

- Stops and removes containers
- Keeps volumes (data remains)

### 5) Full reset of local DB/cache data

```bash
docker-compose down -v
```

What this does:

- Stops containers and removes attached volumes
- Deletes local PostgreSQL and Redis data

## Backend Data Packages

If needed, install backend data dependencies:

```bash
npm install pg typeorm @nestjs/typeorm redis
```

What this does:

- `pg`: PostgreSQL driver
- `typeorm` + `@nestjs/typeorm`: ORM and Nest integration
- `redis`: Redis client

## Run the Project Locally

Open two terminals in the project root.

Terminal 1: frontend

```bash
npx nx serve frontend
```

What this does:

- Starts Angular development server with watch mode

Terminal 2: backend

```bash
npx nx serve backend
```

What this does:

- Starts NestJS API server with watch mode

## Daily Nx Commands

Run dependency graph:

```bash
npx nx graph
```

Build apps:

```bash
npx nx build frontend
npx nx build backend
```

Run tests:

```bash
npx nx test frontend
npx nx test backend
```

Run lint:

```bash
npx nx lint frontend
npx nx lint backend
```

Reset Nx local cache:

```bash
npx nx reset
```

## Common Troubleshooting

Port already in use (`5432` or `6379`):

- Stop conflicting local services or change mapped ports in `docker-compose.yml`

Backend cannot connect to DB:

- Check `docker-compose ps` and confirm `postgres` is running
- Verify `DATABASE_URL` in `.env.dev`

Redis connection errors:

- Check `docker-compose ps` and confirm `redis` is running
- Verify `REDIS_URL` in `.env.dev`

Nx task failures after dependency updates:

- Run `npm install`
- Run `npx nx reset`

## Important Notes

- Do not commit real secrets to git
- Keep `.env.dev` local-only for development values
- Run Docker services before starting the backend
