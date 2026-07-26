# OAuth connector setup

The application uses the OAuth 2.0 authorization-code flow. Provider passwords are entered only on the provider's official website. Access and refresh tokens remain on the backend and are never returned to the React application.

Byizon's developer registers one OAuth application per provider. End users do not create apps or enter Client IDs: each user clicks Connect, signs in on the provider website, selects a workspace/account, and grants permission. Byizon binds the resulting encrypted token to that user's signed workspace identity and uses only that token for later chat commands.

## Local callback URLs

Register the matching callback URL in each provider's developer console:

- Microsoft 365: `http://localhost:8000/api/oauth/callback/microsoft-365`
- Google Workspace: `http://localhost:8000/api/oauth/callback/google-workspace`
- Salesforce: `http://localhost:8000/api/oauth/callback/salesforce`
- HubSpot: `http://localhost:8000/api/oauth/callback/hubspot`
- Slack: `http://localhost:8000/api/oauth/callback/slack`
- Jira: `http://localhost:8000/api/oauth/callback/jira`

HubSpot requires `localhost` for local HTTP testing and does not accept an IP-address callback. The callback value must match exactly.

## Credentials

Copy `.env.example` to `.env`, then add each provider's Client ID and Client Secret. Never add `.env` to source control.

### Microsoft 365

Create a Microsoft Entra ID web app. Add the callback URL and delegated permissions `User.Read` and `Files.Read`. The application also requests OpenID profile/email and offline access.

### Google Workspace

Create an OAuth web client in Google Cloud, configure the consent screen, and add the callback URL. Enable these APIs in the same project:

- Google Drive API
- Google Sheets API
- Gmail API
- Google Calendar API
- Google Docs API

The user sees Google's official account chooser and consent screen once. Byizon
requests the configured Workspace permissions together so Drive, Sheets, Gmail,
Calendar/Meet, and Docs can use the same authorized Google account.

Available permission groups:

- Google Drive: browse supported Drive files.
- Google Sheets: browse, create, and update spreadsheets.
- Gmail: read authorized message metadata and send email.
- Google Calendar: read calendars and create events.
- Google Meet: create a Meet conference through Calendar and invite attendees.
- Google Docs: create documents from the current calculated report.

After approval, Byizon can:

- Browse and analyze Sheets, Docs, supported Drive files, Gmail metadata, and Calendar events.
- Send a Gmail message when the chatbot command includes a recipient.
- Create Calendar events when the command includes an exact `YYYY-MM-DD HH:MM` value.
- Create Google Meet links and email Calendar invitations to supplied attendees.
- Create Google Docs from the current calculated report.
- Append calculated KPIs to a selected or newly created Google Sheet.

Meet creation uses the Google Calendar API; a separate Google Meet API credential
is not required for this workflow. Existing Google connections created with
partial scopes must reconnect once to approve the combined permission set.

Authorization and task execution remain separate. One sign-in makes the Google
services available, but each manual/chat/voice task must identify Gmail, Sheets,
Calendar, Meet, or Docs. If a command such as `current report save karo` is
ambiguous, Byizon displays service choices instead of guessing.

#### Public multi-user Google access

Byizon binds each successful Google authorization to Google's verified immutable
account subject, then stores that user's provider tokens under a separate signed
workspace identity. A visitor can therefore choose their own Google account and
cannot see another user's connections, uploads, or analysis sessions.

For a deployed public application:

1. Set the OAuth audience to **External**.
2. Add the deployed HTTPS callback URI:
   `https://YOUR-DOMAIN/api/oauth/callback/google-workspace`
3. Configure an authorized domain, public home page, privacy policy, and terms
   links using a domain you control.
4. Move the app from **Testing** to **Production**.
5. Submit the requested sensitive scopes for Google verification. Drive, Gmail,
   Calendar, Sheets, and Docs access cannot be offered as an unrestricted public
   production integration merely by adding test users.
6. Until verification is complete, keep the app in Testing and add each demo
   account under **Audience > Test users**.

The OAuth screen always requests account selection. End users only choose an
account and approve access; they never enter a Client ID, Client Secret, or
provider password inside Byizon.

#### Get the Google Client ID and Client Secret

1. Open Google Cloud Console and create or select one project for Byizon.
2. In **APIs & Services > Library**, enable Drive, Sheets, Gmail, Calendar, and Docs APIs.
3. Open **Google Auth Platform** and configure Branding, Audience, and Data Access.
4. During development choose **External** and add the email addresses that will test Byizon.
5. Open **Clients**, create an **OAuth client ID**, and select **Web application**.
6. Add this Authorized redirect URI exactly:
   `http://localhost:8000/api/oauth/callback/google-workspace`
7. Copy the generated Client ID and Client Secret into `.env`:

```dotenv
GOOGLE_WORKSPACE_CLIENT_ID=your-client-id
GOOGLE_WORKSPACE_CLIENT_SECRET=your-client-secret
```

Only the developer configures these two values. Every Byizon user simply clicks Google Workspace, selects an existing Google account, reviews permissions, and clicks Continue/Allow.

### Salesforce

Create an External Client App or Connected App with the callback URL and `api`, `refresh_token`, and `id` scopes.

### HubSpot

Create a public HubSpot app, add the callback URL, and enable read access for contacts, companies, and deals.

### Slack

Create a Slack app and add the callback URL under OAuth & Permissions. Add bot token scopes `channels:read`, `channels:history`, `channels:join`, `groups:read`, `groups:history`, `files:read`, and `chat:write`. Put the Client ID and Client Secret in `.env` to browse channel messages and analyze uploaded data files. Existing Slack connections must be authorized again after adding scopes.

For outgoing notifications, enable Incoming Webhooks, add a webhook to a channel, and store its URL as `SLACK_WEBHOOK_URL`. The Connections page includes a test button when the webhook is configured.

### Jira

Create an Atlassian OAuth 2.0 (3LO) app, add the Jira callback URL, and grant `read:jira-work`, `read:jira-user`, and `offline_access`. Put the Client ID and Client Secret in `.env`. Each user can then authorize their own Jira Cloud site and browse/analyze projects without sharing an Atlassian password with Byizon.

## Other connector setup (excluding HubSpot)

### Salesforce CRM

1. In Salesforce Setup, create an External Client App or Connected App.
2. Enable OAuth and add:
   `https://YOUR-DOMAIN/api/oauth/callback/salesforce`
3. Grant `api`, `refresh_token`, and `id`.
4. Put the Consumer Key in `SALESFORCE_CLIENT_ID` and Consumer Secret in
   `SALESFORCE_CLIENT_SECRET`.
5. Each Byizon user then signs in to their own Salesforce account and grants
   access. Provider passwords are never entered in Byizon.

### Microsoft 365

1. In Microsoft Entra admin center, register a Web application.
2. Add:
   `https://YOUR-DOMAIN/api/oauth/callback/microsoft-365`
3. Add delegated permissions `User.Read` and `Files.Read`.
4. Create a client secret and save the Application (client) ID and secret as
   `MICROSOFT_365_CLIENT_ID` and `MICROSOFT_365_CLIENT_SECRET`.

### Slack

1. Create a Slack app and configure the deployed callback:
   `https://YOUR-DOMAIN/api/oauth/callback/slack`
2. Add the bot scopes listed in the Slack section above.
3. Save the app Client ID and Client Secret as `SLACK_CLIENT_ID` and
   `SLACK_CLIENT_SECRET`.
4. Reinstall the app after changing scopes, then invite the app to private
   channels whose files should be available.

### Jira Cloud

1. Create an Atlassian OAuth 2.0 (3LO) integration.
2. Add:
   `https://YOUR-DOMAIN/api/oauth/callback/jira`
3. Grant `read:jira-work`, `read:jira-user`, and `offline_access`.
4. Save the credentials as `JIRA_CLIENT_ID` and `JIRA_CLIENT_SECRET`.

Glean, Zapier, and Workato remain organization-specific because their OAuth
endpoints and approved scopes depend on the customer's enterprise tenant. Their
catalog entries should not be presented as fully operational until those tenant
values and resource APIs are configured.

## Required `.env` values

```dotenv
OAUTH_CALLBACK_BASE=http://localhost:8000
FRONTEND_URL=http://127.0.0.1:5173/connections

GOOGLE_WORKSPACE_CLIENT_ID=
GOOGLE_WORKSPACE_CLIENT_SECRET=
GOOGLE_WORKSPACE_SCOPES=openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/documents

HUBSPOT_CLIENT_ID=
HUBSPOT_CLIENT_SECRET=

SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=
SLACK_WEBHOOK_URL=

JIRA_CLIENT_ID=
JIRA_CLIENT_SECRET=

BYIZON_SESSION_SECRET=
```

Client Secret is required in addition to Client ID for server-side OAuth. Provider passwords are never stored.

## Supported chatbot action examples

```text
Slack ke #management channel me current report bhejo
Gmail se manager@example.com ko current report bhejo
Google Doc banao title: July Analysis
Calendar event create karo title: Review on 2026-07-20 15:30 for 45 minutes
Google Meet link banao title: Review on 2026-07-20 15:30 aur manager@example.com ko bhejo
Current report Google Sheet "Monthly Review" me save karo
Current report ke liye create new Google Sheet
```

Write actions run only against the account authorized by the current Byizon user. If a required recipient, date/time, or resource name is missing, the chatbot asks for it instead of guessing.

The UI shows command-understanding, permission-check, provider-request, and
completion states. Completed Gmail, Calendar, Meet, Docs, and Sheets actions are
also recorded in the Customized Dashboard activity panel for the current
workspace only.

## Production requirements

- Change both callback and frontend URLs to HTTPS.
- OAuth tokens are encrypted with AES-256-GCM in `backend/data/connections.sqlite3`. Set `BYIZON_CONNECTOR_ENCRYPTION_KEY` to a stable URL-safe base64 32-byte key in production; local development generates a private key automatically.
- Set `BYIZON_SESSION_SECRET` to a separate long random secret. It signs the HttpOnly browser workspace cookie used for per-user token and analysis-session isolation.
- Use one application encryption key, token rotation, provider revocation, audit logging, and tenant-level access controls.
- Review and minimize scopes before production approval.
