# FIWB Project Versions & Stability Checkpoints

This file tracks stable, verified versions of the codebase. Use these checkpoints to revert changes if new updates break functionality.

## 🔵 Stable Version v1.2 (Picker & Trust Fixed)
- **Status**: Stable
- **Date**: 2026-03-14
- **Key Fixes Included**:
  - **Picker UX**: Configured `AppId` and `Origin` for the Google Picker API to eliminate redundant sign-in prompts within the app.
  - **Platform Trust**: Added `GOOGLE_API_KEY` (Developer Key) to both frontend and backend to establish full trust with Google API services.
  - **Environment Integrity**: Verified backend `.env` configuration and centralized API keys for production reliability.
  - **Drive Global Access**: Confirmed `supportsAllDrives=True` enforcement across all retrieval and sync methods.

## 🔵 Stable Version v1.1 (Drive & Sync Fixed)
- **Status**: Stable
- **Date**: 2026-03-14
- **Git Commit Hash**: `7a59d33e23472a85cd922a2b810103e5d7ef85e3`
- **Key Fixes Included**:
  - **Drive Preview Native**: Switched to native Google Drive `/preview` URLs with automatic token-based pre-authentication. Resolves 404/File Not Found errors in Classroom attachments.
  - **Shared Drive Sync**: Enabled `supportsAllDrives=True` in the backend sync service. Resolves missing/unindexed Drive files owned by other users or in Google Classroom folders.
  - **Auth Token Proxy**: Frontend now automatically fetches fresh Google access tokens to pre-authenticate Drive iframes.
  - **Sync Robustness**: Fixed `NameError` crashes in `sync_service.py` and improved error logging for file content extraction.

## 🟢 Stable Version v1.0 (Initial Baseline)
- **Status**: Stable
- **Date**: 2026-02-19
- **Git Commit Hash**: `5c6463353104004d42b108b7d90d477defff9d0e6`
- **Key Fixes Included**:
  - **Segfault Prevention**: Strict `GLOBAL_API_LOCK` implemented across Classroom, Gmail, and Drive services to prevent `httplib2` SSL crashes.
  - **Sync Stability**: Added safety guards in `sync_service.py` to prevent mass deletion of courses if API returns empty list.
  - **Database Concurrency**: Configured PostgreSQL connection pooling and worker counts correctly in `railway.toml`.
  - **Auto-Healing**: Frontend and Backend now handle missing user records gracefully.

### How to Revert to this Version

If future changes break the application, run the following commands in your terminal to revert to this exact state:

```bash
# 1. Fetch all updates
git fetch --all

# 2. Reset your local code to this stable version (WARNING: Discards uncommitted changes)
git reset --hard 5c6463353104004d42b108b7d90d477defff9d0e6

# 3. Force push to restore the remote repository (if needed)
git push origin main --force
```

### Critical Configuration Notes
- **Runtime**: Python 3.12 (specified in `railway.toml`)
- **Database**: PostgreSQL (Internal Railway URL required)
- **Workers**: 2 workers enabled in `railway.toml`
