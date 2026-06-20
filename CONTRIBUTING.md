# Contributing to FinMate

Thank you for your interest in contributing to FinMate! This guide outlines the branching strategy, commit conventions, and PR process.

## Getting Started

1. Clone the repository and follow the setup instructions in [README.md](./README.md)
2. Read the [ARCHITECTURE.md](./ARCHITECTURE.md) for a high-level overview
3. Review the [AGENT_RULES.md](./AGENT_RULES.md) for coding standards and technology stack decisions

## Branching Strategy

We use a trunk-based development model with short-lived feature branches:

```
main (production-ready)
 ├── feature/add-expense-tags
 ├── fix/group-balance-calculation
 ├── chore/update-dependencies
 └── docs/api-specification
```

### Branch Naming

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feature/` | New features | `feature/expense-receipts` |
| `fix/` | Bug fixes | `fix/split-rounding-error` |
| `chore/` | Maintenance, refactoring, deps | `chore/upgrade-angular-21` |
| `docs/` | Documentation only | `docs/api-endpoints` |
| `hotfix/` | Critical production fixes | `hotfix/auth-token-expiry` |

### Rules

- Branch from `main`, merge back to `main`
- Keep branches short-lived (ideally < 3 days)
- Rebase on `main` before opening a PR
- Delete branches after merge

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes only |
| `style` | Code style changes (formatting, missing semi-colons) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Build process, dependencies, or tooling changes |
| `ci` | CI/CD configuration changes |

### Scopes

Use the package or module name: `backend`, `frontend`, `data-models`, `expenses`, `groups`, `auth`, `settlements`.

### Examples

```
feat(expenses): add category-based filtering to expense list
fix(groups): correct balance calculation for spectator members
chore(deps): upgrade @nestjs/core to v11.1
docs(api): update OpenAPI spec for settlements endpoint
refactor(backend): extract expense access checks into dedicated service
test(frontend): add unit tests for encryption service
```

## Pull Request Process

### Before Opening a PR

- [ ] Code compiles without errors: `npx nx build frontend` and `npx nx build backend`
- [ ] All tests pass: `npx nx test frontend` and `npx nx test backend`
- [ ] Lint passes: `npx nx lint frontend` and `npx nx lint backend`
- [ ] New services/interceptors have unit tests
- [ ] No `any` types in TypeScript
- [ ] No hardcoded API URLs (use `environment.apiBaseUrl`)
- [ ] DTOs use `class-validator` decorators
- [ ] Progress log entry added to `FinMate_Project_Specification.md`

### PR Template

```markdown
## Summary
Brief description of the change.

## Type
- [ ] Feature
- [ ] Bug Fix
- [ ] Refactor
- [ ] Documentation
- [ ] Chore

## Changes
- File 1: description
- File 2: description

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing performed
- [ ] Build verified

## Screenshots (if UI changes)
```

### Review Guidelines

- At least 1 approval required before merge
- Address all review comments before merging
- Use "Squash and merge" to keep `main` history clean
- PR title should follow conventional commit format

## Code Standards

Refer to [AGENT_RULES.md](./AGENT_RULES.md) for detailed coding standards, including:

- TypeScript strict mode (no `any` types)
- Angular standalone components with `inject()`
- NestJS DTOs with `class-validator`
- Tailwind CSS for styling
- Environment-based API URL configuration
- JSDoc on all public service methods
