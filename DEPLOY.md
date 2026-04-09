# DataPilot AI - Deployment Guide (Render)

This guide covers deploying the entire monorepo architecture (FastAPI Backend, Next.js Frontend, Redis, and Celery Worker) to [Render](https://render.com/) using a single Configuration Blueprint.

## Prerequisites
1. A [Render](https://render.com/) account.
2. A [Supabase](https://supabase.com/) project (with your Database and Auth components).
3. Your codebase pushed to a GitHub/GitLab repository.

---

## Step 1: The Blueprint Configuration

We have created a `render.yaml` file at the root of your repository. This file serves as an **Infrastructure as Code (IaC)** blueprint. It instructs Render exactly how to spin up all four services and automatically wires them together so they can talk to each other.

### Architecture Handled by Blueprint:
1.  **`datapilot-api`**: FastAPI Python Web Service (Runs the main API endpoints).
2.  **`datapilot-worker`**: Celery Background Worker (Runs the heavy ML Training loop).
3.  **`datapilot-web`**: Next.js Node Web Service (Serves your dashboard).
4.  **`datapilot-redis`**: Managed Redis Instance (Acts as the message broker between API and Worker).

## Step 2: Push Your Code
Ensure that the `render.yaml` file is committed to your GitHub branch. 
```bash
git add render.yaml
git commit -m "chore: add render blueprint"
git push
```

## Step 3: Deploy to Render
1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click on the **"Blueprints"** tab on the left sidebar.
3. Click **"New Blueprint Instance"**.
4. Connect your GitHub account and select your `DataPilotAI` repository.
5. Render will detect the `render.yaml` file. Click **"Approve"**.

## Step 4: Supply Secrets
The Blueprint securely requests values for specific environment variables that it cannot infer automatically. When prompted by Render, provide your production Supabase keys:

*   **`SUPABASE_URL`**: E.g., `https://xxxxxxxxx.supabase.co`
*   **`SUPABASE_SERVICE_ROLE_KEY`**: Your secret Service Role Key.
*   **`NEXT_PUBLIC_SUPABASE_URL`**: (Same as above)
*   **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**: Your public Anon Key.
*   **`NEXT_PUBLIC_API_BASE_URL`**: During setup, since the backend is still being provisioned, Render won't know its final live URL yet. Start by setting this to `https://placeholder-api.onrender.com`. Once the deployment finishes, copy the real `.onrender.com` URL of the `datapilot-api` backend, go to the `datapilot-web` settings area, update this variable, and it will re-deploy instantly.

## Step 5: Wait for Build
Once you supply the secrets and click "Apply", Render will simultaneously spin up all four instances. 
- The Redis instance will deploy instantly.
- The Python and Node.js environments will install their dependencies (`requirements.txt` and `package.json`).
- Once the builds finish, the Next.js site will be given an `.onrender.com` URL!

---

### Cost Estimation (Without Free Tier)
If you cannot use the completely free Redis instance, you can safely swap it to the $3/month starter tier. Web and Worker instances usually cost $7/mo each on the Starter tier. The total tech stack usually costs ~$20/mo starting out.
