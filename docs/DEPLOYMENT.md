# Byizon production deployment

The application is packaged as one Docker service. The Python backend serves both
the Vite production build and `/api` routes from the same domain. This is required
for OAuth state, workspace cookies, protected dashboard links, uploads, chat, and
voice APIs to work reliably.

## Deploy on Render

1. Push this repository to GitHub.
2. In Render, choose **New > Blueprint** and select the repository.
3. Render reads `render.yaml` and creates `byizon-ai-analytics`.
4. Enter secret environment variables when prompted. Never commit `.env`.
5. Wait for the health check at `/api/health` to pass.
6. Copy the final HTTPS service URL, for example:
   `https://byizon-ai-analytics.onrender.com`

The Blueprint uses a persistent disk at `/var/data`. A paid Render service is
required for persistent OAuth connections, encrypted share records, and local
security keys. A free ephemeral service can be used only for a short demo.

## Required production environment values

Replace `https://YOUR-BYIZON-DOMAIN` with the exact Render URL:

```env
OAUTH_CALLBACK_BASE=https://YOUR-BYIZON-DOMAIN
FRONTEND_URL=https://YOUR-BYIZON-DOMAIN/connections
FRONTEND_ORIGIN=https://YOUR-BYIZON-DOMAIN
BYIZON_DATA_DIR=/var/data
```

Also configure the server-side keys used by the features you want to demonstrate:

```env
HF_API_KEY=
HF_MODEL=meta-llama/Llama-3.1-8B-Instruct
STITCH_API_KEY=
GOOGLE_CLOUD_PROJECT=
GOOGLE_WORKSPACE_CLIENT_ID=
GOOGLE_WORKSPACE_CLIENT_SECRET=
BYIZON_SMTP_HOST=smtp.gmail.com
BYIZON_SMTP_PORT=587
BYIZON_SMTP_TLS=1
BYIZON_SMTP_FROM=
BYIZON_SMTP_USER=
BYIZON_SMTP_PASSWORD=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=
SLACK_WEBHOOK_URL=
```

`BYIZON_SMTP_USER` and `BYIZON_SMTP_FROM` can use the same Gmail address.
`BYIZON_SMTP_PASSWORD` must be a Google App Password created after enabling
2-Step Verification; do not use or commit the normal Gmail password. Without
SMTP configuration, development OTPs are written only to
`backend/data/email_outbox.jsonl` (or `$BYIZON_DATA_DIR/email_outbox.jsonl`).

## Google OAuth production update

In Google Cloud Console, open the existing Web OAuth client and add:

```text
Authorized JavaScript origin:
https://YOUR-BYIZON-DOMAIN

Authorized redirect URI:
https://YOUR-BYIZON-DOMAIN/api/oauth/callback/google-workspace
```

Keep the localhost entries for local development. While the Google app is in
Testing mode, add every reviewer Gmail address under **Audience > Test users**.

## Slack OAuth production update

In Slack app settings, open **OAuth & Permissions > Redirect URLs** and add:

```text
https://YOUR-BYIZON-DOMAIN/api/oauth/callback/slack
```

Keep the localhost callback for local development. Reinstall the Slack app after
scope changes. The app must be invited to private channels before it can read
their messages or files.

## Reviewer checklist

- Open the HTTPS deployment in a private browser window.
- Upload a small CSV or XLSX file and confirm the dashboard changes.
- Ask the chat a calculation question and compare it with the uploaded file.
- Create a password-protected share and unlock it in another private window.
- Export a password-protected PDF and open it with the chosen password.
- Connect Google or Slack using a reviewer account only after its OAuth access is
  allowed as described above.

Uploaded analysis sessions are held in application memory and can be cleared on a
service restart. Protected shares and OAuth connection records are persisted on
the mounted disk.
