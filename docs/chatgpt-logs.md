# Update cards from email or meeting transcripts

1. Open the workspace containing the cards you want to update.
2. Select **Tools → Paste update log → Copy prompt**. The prompt includes card IDs, project/client names, assignees, start dates, and current task titles for that workspace. Review it using **View prompt** if needed.
3. Paste the prompt into your ChatGPT conversation, then provide the email or transcript. Ask ChatGPT to return the update log.
4. Paste its JSON result into the app and select **Review matches**.
5. Review each destination card and proposed change. Choose a card for ambiguous names, or select **Skip / choose a card** to exclude an update.
6. Select **Apply updates**. Changes use the normal board autosave.

This is a copy/paste workflow; the app does not call OpenAI or access your email. It needs no OpenAI API key. Information goes to ChatGPT only when you paste the prompt/source into your conversation.

## What happens on import

- Matching is limited to the current workspace. An exact card ID takes precedence. Otherwise, every supplied project/client name must match after case and whitespace normalization. Multiple matches require a manual choice; no match creates no card.
- Project name, client name, assignee and start date are filled only when empty. Existing values are kept and conflicts are shown in the preview.
- General notes appear under **Project updates** in the card, with the source and import date.
- Tasks are added unchecked. Context for a uniquely matching existing task is appended to its context history, preserving its current note and completion state.
- New tasks reopen a finished card. Notes alone leave its status unchanged. Cards on hold remain on hold.
- Duplicate notes, tasks and context are skipped. Apply recalculates against the latest board, so stale previews cannot overwrite populated fields.
- Only explicitly supported fields are accepted. Malformed JSON and invalid dates produce a readable error. Up to 100 updates may be imported per log.

## Log format

```json
{
  "schema": "sml-card-log/v1",
  "source": "Client email · 2026-10-20",
  "updates": [
    {
      "match": { "project": "Website", "client": "Acme" },
      "fields": { "assignedPerson": "Alex", "startDate": "2026-10-22" },
      "notes": ["The client approved the visual direction."],
      "tasks": [
        { "text": "Send final artwork", "context": "Include mobile and desktop exports." }
      ]
    }
  ]
}
```

Use `match.cardId` from the generated prompt for the most reliable matching. `fields`, `notes`, and `tasks` are optional, but each update must contain something to add. Dates must be real calendar dates in `YYYY-MM-DD` format. Do not infer unknown facts or completion states from an ambiguous transcript.

For a future direct API integration, OpenAI Structured Outputs can constrain the generated response to a JSON schema: https://developers.openai.com/api/docs/guides/structured-outputs. Local validation and review should still remain in the app.
