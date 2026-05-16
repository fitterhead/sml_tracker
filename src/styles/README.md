# style map

`App.css` is now only the import entrypoint. Keep the import order stable because later files intentionally override earlier shared rules.

- `base.css`: root tokens, reset, and body defaults.
- `layout.css`: app shell sizing.
- `header.css`: brand, search, header actions, and top nav text.
- `shared.css`: shared buttons, hover behavior, section/header primitives.
- `cards.css`: card shell, checklist display, priority dots, inline checklist composer.
- `board.css`: board grid, to do columns, finish/on hold stacks, page views, legend.
- `modals.css`: modal shell, confirm/export/login modal structure, fields.
- `focus.css`: focus mode grid, focus checklist, move/save/delete action rows.
- `responsive.css`: tablet and mobile overrides.
