# Microsoft SSO Setup Guide

Enable "Sign in with Microsoft" for CogVeri — no paid subscription required.

---

## Prerequisites

- A free [Azure account](https://portal.azure.com) (create one if you don't have it)
- Access to CogVeri's EC2 environment variables

---

## Step 1 — Register the App in Azure

1. Go to [portal.azure.com](https://portal.azure.com) and sign in
2. Search for **"App registrations"** in the top search bar and click it
3. Click **"New registration"**
4. Fill in the form:
   - **Name:** `CogVeri` (or `CogVeri Production`)
   - **Supported account types:** Select **"Accounts in any organizational directory and personal Microsoft accounts"**
     > This allows both work/school accounts (Microsoft 365) and personal Outlook/Hotmail accounts to sign in
   - **Redirect URI:**
     - Platform: **Web**
     - URI: `https://api.cogveri.com/api/auth/microsoft/callback`
5. Click **Register**

---

## Step 2 — Copy the Client ID

After registration you'll land on the app overview page.

- Copy the **Application (client) ID** — this is your `MICROSOFT_CLIENT_ID`
- Copy the **Directory (tenant) ID** — keep this for reference (you won't need it unless you restrict sign-in to a single org)

---

## Step 3 — Create a Client Secret

1. In the left sidebar, click **"Certificates & secrets"**
2. Click **"New client secret"**
3. Give it a description (e.g. `CogVeri Production`) and set expiry to **24 months**
4. Click **Add**
5. **Copy the secret value immediately** — Azure only shows it once
   > This is your `MICROSOFT_CLIENT_SECRET`

---

## Step 4 — Set Permissions (optional but recommended)

By default the app has `User.Read` which is all CogVeri needs (name, email, profile).

To verify:
1. Click **"API permissions"** in the sidebar
2. Confirm `Microsoft Graph → User.Read` is listed
3. No additional permissions are required — do **not** grant admin consent for anything else

---

## Step 5 — Add Environment Variables to EC2

SSH into the CogVeri EC2 instance and add the following to your environment config (`.env`, systemd unit, or however you manage env vars):

```env
MICROSOFT_CLIENT_ID=<paste Application (client) ID here>
MICROSOFT_CLIENT_SECRET=<paste client secret value here>
MICROSOFT_REDIRECT_URI=https://api.cogveri.com/api/auth/microsoft/callback

# Leave MICROSOFT_TENANT as 'common' to allow all Microsoft accounts.
# Set to your Azure tenant ID to restrict sign-in to your org only.
MICROSOFT_TENANT=common
```

Then restart the backend service.

---

## Step 6 — Test It

1. Open [cogveri.com/login](https://cogveri.com/login)
2. You should now see a **"Continue with Microsoft"** button below the Google button
3. Click it — you'll be redirected to Microsoft's login page
4. Sign in with any Microsoft account
5. On success you'll be redirected back to the CogVeri dashboard

If you see an error, check:
- The redirect URI in Azure **exactly** matches `MICROSOFT_REDIRECT_URI` in your env (no trailing slash)
- The client secret hasn't expired
- The backend has been restarted after the env var change

---

## Restricting to a Single Organisation (optional)

If you want only users from a specific Microsoft 365 tenant (e.g. your company) to sign in:

1. In Azure → App registration → **Authentication**
2. Under "Supported account types", change to **"Accounts in this organizational directory only"**
3. In your env, set `MICROSOFT_TENANT=<your-tenant-id>` (the Directory ID from Step 2)

This is useful for enterprise customers who want to lock CogVeri to their own Entra ID directory.

---

## Secret Rotation (when the secret expires)

Client secrets expire — set a calendar reminder before the 24-month expiry.

1. Azure → App registrations → Your app → Certificates & secrets
2. Create a **new** secret before deleting the old one
3. Update `MICROSOFT_CLIENT_SECRET` in EC2 env
4. Restart the backend
5. Delete the old secret in Azure

---

## Cost

**Zero.** App registration and basic OAuth sign-in are entirely free on Microsoft's platform. No Azure subscription or Microsoft 365 license is required for CogVeri to offer this sign-in option.

Users signing in with a **work or school account** need their employer to have Microsoft 365 — but that's their employer's subscription, not yours. Users with a personal **Outlook.com / Hotmail / Live** account can sign in for free with no subscription at all.
