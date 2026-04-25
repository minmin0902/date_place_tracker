# send-push Edge Function

Web Push delivery for the in-app notifications inbox. Triggered by a Supabase Database Webhook on `INSERT into public.notifications`.

## One-time setup

### 1. Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

You'll get a public/private pair. The public key is bundled into the frontend; the private key stays server-side.

### 2. Set frontend env var

In Vercel project settings (or `.env.local` for local dev):

```
VITE_VAPID_PUBLIC_KEY=<the public key>
```

Redeploy the frontend after setting it.

### 3. Set Supabase function secrets

```bash
supabase secrets set VAPID_PUBLIC_KEY=<the public key>
supabase secrets set VAPID_PRIVATE_KEY=<the private key>
supabase secrets set VAPID_SUBJECT="mailto:you@example.com"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already auto-injected by the Supabase platform — don't set those manually.

### 4. Deploy the function

```bash
supabase functions deploy send-push --no-verify-jwt
```

`--no-verify-jwt` is needed because the Database Webhook calls the function without an end-user JWT. Authorization happens via the service-role key the function uses internally.

### 5. Wire the Database Webhook

Supabase dashboard → **Database** → **Webhooks** → **Create a new hook**:

- Name: `notifications-push`
- Table: `public.notifications`
- Events: ☑ INSERT
- Type: **Supabase Edge Functions**
- Function: `send-push`
- HTTP method: POST
- HTTP headers: leave default

Save. Insert a test row into `notifications` and watch the function logs.

## Local debugging

```bash
supabase functions serve send-push --env-file ./supabase/.env.local
```

Then POST a fake webhook payload at `http://localhost:54321/functions/v1/send-push`:

```json
{
  "type": "INSERT",
  "table": "notifications",
  "record": {
    "id": "00000000-0000-0000-0000-000000000000",
    "recipient_id": "<a real user id with a push_subscriptions row>",
    "kind": "memo_thread",
    "actor_id": "<actor user id>",
    "place_id": "<place id>",
    "food_id": null,
    "memo_id": null,
    "preview": "테스트 메모",
    "created_at": "2026-04-25T00:00:00Z"
  }
}
```

## Troubleshooting

- `no subscriptions` response → the recipient has never enabled push from a browser, or all their endpoints have been pruned. Check `push_subscriptions` in the SQL editor.
- 401 from web-push → VAPID keys mismatched between server (this function) and client (`VITE_VAPID_PUBLIC_KEY`). Both must come from the same `web-push generate-vapid-keys` run.
- iPhone never receives push → the user must have **added the app to Home Screen** as a PWA. Safari's regular tab does not deliver push as of iOS 17.
