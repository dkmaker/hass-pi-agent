# Contributing to Pi Agent for Home Assistant

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) to automate versioning and changelog generation.

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description | Version Bump |
|------|-------------|-------------|
| `feat` | New feature | Minor (0.x.0) |
| `fix` | Bug fix | Patch (0.0.x) |
| `docs` | Documentation only | None |
| `chore` | Maintenance, dependencies | None |
| `ci` | CI/CD changes | None |
| `refactor` | Code restructuring | None |
| `test` | Adding/updating tests | None |
| `perf` | Performance improvement | Patch |

### Breaking Changes

Add `!` after the type or include `BREAKING CHANGE:` in the footer:

```
feat!: redesign add-on configuration schema

BREAKING CHANGE: The `options` format has changed. See migration guide.
```

While pre-1.0, breaking changes bump the **minor** version (e.g., 0.1.13 → 0.2.0).

### Examples

```
feat: add support for Google Vertex AI provider
fix: correct WebSocket reconnection on token refresh
docs: update add-on installation instructions
chore: bump base image to Alpine 3.21
ci: add PR title linting workflow
```

## Pull Requests

- PR titles **must** follow the conventional commit format (enforced by CI)
- PRs are squash-merged, so the PR title becomes the commit message
- Use a clear, descriptive title — it will appear in the changelog

## Release Process

Releases are fully automated via [release-please](https://github.com/googleapis/release-please):

1. Push conventional commits to `main` (via squash-merged PRs)
2. release-please automatically creates/updates a **Release PR** with:
   - Version bump in `addon/config.yaml`
   - Updated `CHANGELOG.md`
3. A maintainer reviews and merges the Release PR
4. release-please creates a **GitHub Release** with a `v*.*.*` tag
5. The tag triggers the Docker build workflow → images pushed to GHCR
