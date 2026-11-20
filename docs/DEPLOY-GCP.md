# Running flashback on a small Google Cloud server (personal use)

One small virtual machine (Compute Engine) runs two containers: **flashback** and **Caddy**, which serves it over HTTPS and renews the certificate by itself. The SQLite database and every private photo live in `~/flashback/data` on the VM's disk.

Why a VM and not Cloud Run / App Engine / GitHub Pages: the app keeps its database and photos on local disk and streams live party updates, so it needs one always-on server with a persistent disk. (Cloud Run's disk is temporary, so games and photos would disappear.)

> Prices and free-tier terms change. Check the current Google Cloud pricing page for Compute Engine before you create anything. At the time of writing an `e2-micro` in `us-central1`, `us-east1` or `us-west1` with a standard disk of up to 30 GB was covered by the monthly free tier, and other sizes/regions cost a few dollars a month. An external IPv4 address may add a small charge.

## 0. What you need

* A Google Cloud project with billing enabled (your personal account is fine).
* The `gcloud` CLI on your computer, signed in: `gcloud auth login` then `gcloud config set project YOUR_PROJECT_ID`.
* A **domain name** that you can point at the VM (for example `flashback.yourname.com`). Google only accepts `https://` addresses on a real domain name for the sign-in redirect, not a bare IP address. If you have no domain, a free dynamic-DNS name (for example from DuckDNS) works for this; if Google ever rejects such a name, buy a cheap domain.
* Optional but recommended: a MapTiler key (free tier) for a real map and place labels. Without it the app uses the bundled offline outline map.

## 1. Create the VM

Run these in PowerShell (pick any name; keep the zone in a free-tier region if you want that).

```powershell
gcloud services enable compute.googleapis.com

gcloud compute addresses create flashback-ip --region us-central1

gcloud compute firewall-rules create flashback-web --allow tcp:80,tcp:443 --target-tags flashback-web

gcloud compute instances create flashback-vm `
  --zone us-central1-a `
  --machine-type e2-micro `
  --image-family debian-12 --image-project debian-cloud `
  --boot-disk-size 30GB --boot-disk-type pd-standard `
  --tags flashback-web `
  --address flashback-ip
```

Show the IP and create a DNS **A record** for your domain pointing at it:

```powershell
gcloud compute addresses describe flashback-ip --region us-central1 --format "value(address)"
```

## 2. Prepare the VM (once)

```powershell
gcloud compute scp deploy/vm-setup.sh flashback-vm:~/vm-setup.sh --zone us-central1-a
gcloud compute ssh flashback-vm --zone us-central1-a --command "bash ~/vm-setup.sh"
```

This installs Docker, adds 2 GB of swap (a 1 GB machine cannot build the image without it), prepares `~/flashback/data`, and schedules the nightly cleanup of expired games.

## 3. Google sign-in for Google Photos

In the Google Cloud console, for the same project:

1. **APIs & Services → Library**: enable **Google Photos Picker API** (not Drive's "Google Picker API").
2. **OAuth consent screen**: app name `flashback`, your own email as support and developer contact. Leave the publishing status on **Testing** and add **your own Google account as a test user**. For a server only you use, you never need to publish or verify the app. Google shows an "unverified app" screen when you connect; choose *Advanced → continue*.
3. **Credentials → Create credentials → OAuth client ID → Web application**:
   * Authorized JavaScript origin: `https://YOUR_DOMAIN`
   * Authorized redirect URI: `https://YOUR_DOMAIN/api/auth/google/callback`
4. Copy the client ID and secret into the `.env` file in the next step.

If you use several Google accounts, make sure the account that owns the photos is the one you add as a test user and sign in with.

## 4. Configure and start

On your computer, create the configuration from the template and fill it in:

```powershell
Copy-Item deploy/.env.production.example deploy/.env.vm
notepad deploy/.env.vm
```

Fill in `DOMAIN`, `OWNER_PASSCODE` (a long passphrase, see below), `CRON_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` (32 random bytes; `openssl rand -base64 32`, or `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) and, if you have one, `NEXT_PUBLIC_MAPTILER_KEY`. This file holds secrets: never commit it, never share it.

Upload the project and the configuration, build, and start it:

```powershell
.\deploy\upload.ps1 -Vm flashback-vm -Zone us-central1-a -EnvFile deploy\.env.vm
```

The first build takes several minutes on a small machine. Then open `https://YOUR_DOMAIN`. Caddy needs a minute to get the certificate the first time; the DNS record must already point at the VM.

## 5. Day-to-day

* **Create games:** open `https://YOUR_DOMAIN/new`. Once per browser you enter the owner passcode. Everyone else only needs a room code or a link to *play*.
* **Update after changing the code:** run `.\deploy\upload.ps1 -Vm flashback-vm -Zone us-central1-a` again (without `-EnvFile`). The database, photos and `.env` stay as they are. To change the configuration, run it with `-EnvFile` again.
* **Logs:** `gcloud compute ssh flashback-vm --zone us-central1-a --command "cd ~/flashback && docker compose logs --tail 100 app"`
* **Restart:** `… --command "cd ~/flashback && docker compose restart"`
* **Backups:** games are temporary (7 days by default), so there is little to back up. If you want a safety net, schedule disk snapshots in the console (Compute Engine → Snapshots → Create snapshot schedule).

## The owner passcode

`OWNER_PASSCODE` makes the server private to you. With it set, **creating** anything (a game, uploading photos, importing from Google Photos, the demo) needs a cookie that `/unlock` hands out after you type the passcode. Joining and playing a room never needs it. The passcode is compared in constant time, guesses are rate limited (8 per 10 minutes per address), and the cookie is HttpOnly and holds only a hash. Leave it empty if you want anyone with the address to be able to create games.

## What this setup does not do

* It is one machine: no failover, no scaling, and the database is a single SQLite file. That suits a few people playing at once.
* Memory is tight on an `e2-micro` (1 GB). The app container is capped at 700 MB. If photos fail to process or the app restarts, use an `e2-small` (stop the VM, change the machine type, start it).
* Photos you import from Google Photos are copied to this VM for the game and deleted after `IMAGE_RETENTION_DAYS` (default 7) or when you delete the game. Google's own access tokens are used only during the import and are not kept.
* Nothing here has been run on a real Google Cloud VM yet; treat the first deployment as a test and read the logs if something is off.

## Troubleshooting

* **Site not loading / certificate error:** the DNS A record must point at the VM's IP, and ports 80 and 443 must be open (`gcloud compute firewall-rules list`). Check Caddy: `docker compose logs caddy`.
* **Google says `redirect_uri_mismatch`:** the redirect URI in the OAuth client must be exactly `https://YOUR_DOMAIN/api/auth/google/callback`.
* **Google says the app is blocked / access denied:** the account you sign in with is not in the **Test users** list.
* **"Google Photos is not configured":** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` or `GOOGLE_TOKEN_ENCRYPTION_KEY` is empty in `.env`. After editing `.env`, run `docker compose up -d` again on the VM.
* **Map is plain outlines:** no `NEXT_PUBLIC_MAPTILER_KEY` at build time. It is baked in when the image is built, so rebuild (`upload.ps1`) after adding it.
* **Uploads fail with a permissions error:** `sudo chown -R 1000:1000 ~/flashback/data` on the VM.
