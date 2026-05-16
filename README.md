# SML Tracker Card

React board app for tracking project/client cards with checklist context history,
Excel import/export, focus mode, and server-backed login/autosave.

## Run Locally

Install dependencies:

```sh
npm install
```

Run frontend and backend together:

```sh
npm run dev
```

Open:

```txt
http://localhost:3000
```

The API health check is:

```txt
http://localhost:4000/api/health
```

## Useful Commands

```sh
npm test -- --watchAll=false
npm run build
npm run server
```

## Production

Detailed deployment notes are in:

```txt
docs/deployment.md
```

Supported production paths:

- Netlify-only: React app + Netlify Function API + Netlify Blobs storage.
- Railway + Netlify: Express API on Railway, React frontend on Netlify.

## Environment Variables

Local/backend:

```sh
APP_AUTH_SECRET=replace-with-a-long-random-secret
DATA_DIR=/data
```

Optional Netlify Blobs storage for the local/Express API:

```sh
NETLIFY_BLOBS_ENABLED=true
NETLIFY_SITE_ID=your-netlify-site-id
NETLIFY_ACCESS_TOKEN=your-netlify-personal-access-token
```

Frontend when using Railway API:

```sh
REACT_APP_API_BASE=https://your-railway-service.up.railway.app/api
```

Do not commit real secrets.
