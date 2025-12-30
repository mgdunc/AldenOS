# Deployment Setup

## Current Production Deployment

**Project Name:** `aldenos`  
**Project ID:** `prj_8TwBiBCKfe1jiwYnRvzK978cgAH8`  
**GitHub Repo:** `mgdunc/AldenOS`  
**Branch:** `main`  
**Auto-deploy:** Enabled

## Disconnecting the Other Project (`alden-os`)

To disconnect the `alden-os` project from the GitHub repository:

### Option 1: Via Vercel Dashboard (Recommended)

1. Go to https://vercel.com/dashboard
2. Find the `alden-os` project
3. Click on the project to open it
4. Go to **Settings** → **Git**
5. Click **Disconnect** next to the GitHub repository
6. Confirm the disconnection

### Option 2: Delete the Project (if not needed)

1. Go to https://vercel.com/dashboard
2. Find the `alden-os` project
3. Click on the project
4. Go to **Settings** → **General**
5. Scroll down to **Delete Project**
6. Enter the project name to confirm deletion

## Verifying Current Setup

The current project (`aldenos`) is correctly linked:
- ✅ Project name matches package.json
- ✅ Linked to GitHub repo: `mgdunc/AldenOS`
- ✅ Auto-deploys from `main` branch

## Deployment Process

All deployments happen automatically when code is pushed to the `main` branch:
1. Code is pushed to GitHub: `git push origin main`
2. Vercel detects the push
3. Builds and deploys automatically
4. Available at: `https://aldenos.vercel.app`

## Notes

- The `.vercel` folder contains project configuration (not committed to git)
- Only the `aldenos` project should be connected to the GitHub repo
- The `alden-os` project should be disconnected to avoid duplicate deployments

