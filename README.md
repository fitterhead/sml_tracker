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

## ChatGPT update logs

Use **Tools → Paste update log** to copy a prompt for reviewing emails/transcripts in
ChatGPT, then paste the returned JSON to review and apply updates to existing
cards. No API key is required. See [the workflow and log format](docs/chatgpt-logs.md).

## Rich text fields

Project/client names, assignees, checklist text, and context notes support bold,
italic, bullet/numbered lists, and text colours. Select text and use the toolbar,
or use Cmd/Ctrl+B and Cmd/Ctrl+I. Shift+Enter inserts a line break. Enter keeps
existing save/add behaviour; inside lists it creates the next item (Ctrl/Cmd+Enter
uses the field's save/add action). The completion-note field also accepts normal
paragraphs with Enter.

Formatting is preserved in existing board storage and history. Older plain-text
content remains editable. Search, ChatGPT log matching/prompts, and Excel export
use readable text; spreadsheet exports intentionally omit styling. The editor
engine loads only when a rich field is opened.


## Focused board view

The board opens the last workspace used by the signed-in account on this browser.
Cards show client/project names, age and priority; open a card for checklists,
context and editing. Desktop details open in a side panel, while mobile details
use the full screen. Hold/Finish are collapsed on desktop and are separate status
tabs on mobile. Paste logs, Excel tools, appearance and sorting are under **Tools**.
Formatting controls appear when a text field has focus. Priority flashing is unchanged.
