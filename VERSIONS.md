# FIWB Project Versions & Stability Checkpoints

This file tracks stable, verified versions of the codebase. Use these checkpoints to revert changes if new updates break functionality.

## 🚀 Stable Version v1.1 (Feature Rich - Current Hub)
- **Status**: Stable / Feature Complete (MVP)
- **Date**: 2026-03-03
- **Git Commit Hash**: `de321235cecd3e048397f753f015765c8f3e2c08`
- **Key Modules Included**:
  - **The Digital Twin**: Socratic mentoring with long-term memory synthesis (Learning Styles, Knowledge Gaps).
  - **Neural Assistant**: Gmail & Drive deep integration with predictive insight extraction.
  - **Supermemory V3**: Quad-stream retrieval (Academic, Personal, Chat, Profile).
  - **Cost-Intelligence Tracking**: Industrial USD tracking across SLM/LLM tiers.
  - **Moodle REST Sync**: Full institutional integration for non-Google LMS students.

### How to Revert to this Version

If future changes break the application, run the following commands in your terminal to revert to this exact state:

```bash
# 1. Fetch all updates
git fetch --all

# 2. Reset your local code to this stable version (WARNING: Discards uncommitted changes)
git reset --hard de321235cecd3e048397f753f015765c8f3e2c08

# 3. Force push to restore the remote repository (if needed)
git push origin main --force
```

---

## 🟢 Stable Version v1.0 (Baseline)
- **Status**: Previous Stable
- **Date**: 2026-02-19
- **Git Commit Hash**: `5c6463353104004d42b108b7d90d477defff9d0e6`
- **Key Fixes Included**:
  - **Segfault Prevention**: Strict `GLOBAL_API_LOCK` implemented.
  - **Sync Stability**: Safety guards in `sync_service.py`.
  - **Database Concurrency**: PostgreSQL pooling configured.
  - **Auto-Healing**: Graceful handling of missing users.

### How to Revert to v1.0
```bash
git reset --hard 5c6463353104004d42b108b7d90d477defff9d0e6
```

### Critical Configuration Notes
- **Runtime**: Python 3.12 (specified in `railway.toml`)
- **Database**: PostgreSQL (Internal Railway URL required)
- **Workers**: 2 workers enabled in `railway.toml`
