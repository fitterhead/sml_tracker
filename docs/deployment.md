# Deployment Setup

This app is now server-backed. The React UI requires the API for login,
registration, session restore, and board autosave.

## Local Development

Run frontend and backend together:

```sh
npm run dev
```

Local URLs:

- frontend: `http://localhost:3000`
- backend API: `http://localhost:4000/api/health`

Create a local `.env` file from `.env.example` if you want a stable local
secret:

```sh
APP_AUTH_SECRET=replace-with-a-long-random-secret
DATA_DIR=server/data
```

To make the local Express API read/write Netlify Blobs instead of the JSON file,
add:

```sh
NETLIFY_BLOBS_ENABLED=true
NETLIFY_SITE_ID=your-netlify-site-id
NETLIFY_ACCESS_TOKEN=your-netlify-personal-access-token
```

## Production Option A: Netlify Only

This is the simplest deployment. Netlify serves the React app and runs the API
through `netlify/functions/api.js`. Data is stored in Netlify Blobs.

1. Push this repo to GitHub.
2. In Netlify, choose `Add new project` -> import from GitHub.
3. Keep the root directory as the base directory.
4. Build command: `npm run build`.
5. Publish directory: `build`.
6. Add this environment variable in Netlify:

```sh
APP_AUTH_SECRET=replace-with-a-long-random-secret
```

7. Netlify provides Blobs context automatically during function execution. If you
   run the function outside Netlify, also set `NETLIFY_SITE_ID` and
   `NETLIFY_ACCESS_TOKEN`.
8. Do not set `REACT_APP_API_BASE` for this option. The frontend will use `/api`,
   and `netlify.toml` redirects `/api/*` to the Netlify Function.
9. Deploy, open the site, register the first account, and start using the board.

## Production Option B: Railway Backend + Netlify Frontend

Use this when you want the API running as a normal Express service on Railway.

### Railway Backend

1. Push this repo to GitHub.
2. In Railway, create a new project from the GitHub repo.
3. Railway should pick up `railway.json`.
4. Confirm the start command is:

```sh
npm run server
```

5. Add environment variables:

```sh
APP_AUTH_SECRET=replace-with-a-long-random-secret
DATA_DIR=/data
```

6. Add a Railway Volume and mount it at:

```txt
/data
```

7. Generate a public Railway domain.
8. Confirm the health endpoint works:

```txt
https://your-railway-service.up.railway.app/api/health
```

### Netlify Frontend

1. Create/import the same GitHub repo in Netlify.
2. Build command: `npm run build`.
3. Publish directory: `build`.
4. Add this Netlify environment variable:

```sh
REACT_APP_API_BASE=https://your-railway-service.up.railway.app/api
```

5. Trigger a new Netlify deploy after setting the variable.
6. Open the Netlify URL, register/login, and verify that edits survive refresh.

## Production Check

Before shipping:

```sh
npm test -- --watchAll=false
npm run build
```

After deploy:

1. Open the production URL.
2. Register a test manager account.
3. Create a card.
4. Add multiple contexts to a checklist item.
5. Refresh the page and confirm the card still exists.
6. Log out, log back in, and confirm the same board loads.

## Important Notes

- Keep `APP_AUTH_SECRET` private and long. Do not commit the real value.
- For Railway, attach a volume before real use. Without a volume, file data may
  disappear when the service redeploys.
- For Netlify-only, keep the Netlify Blobs setup active. The included function
  uses `@netlify/blobs` automatically in production.
- `REACT_APP_API_BASE` is a build-time frontend variable. If you change it in
  Netlify, redeploy the frontend.
