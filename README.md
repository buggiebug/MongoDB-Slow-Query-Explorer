# QueryLens — [MongoDB Slow Query Explorer](https://buggiebug.github.io/MongoDB-Slow-Query-Explorer)

A small, dependency-free browser app for reading MongoDB slow-query logs clearly. It imports `.log`, `.txt`, `.json`, and `.jsonl` files, finds slow-query events, and shows the command, execution stats, and query plan.

## Run it

Open `index.html` in a modern browser. Import one or more MongoDB log files or drop them onto the upload area. Files are read locally by the browser and are not uploaded to a server.

## Features

- Reads MongoDB JSON-per-line logs, including shell-prefixed JSON events.
- Skips unrelated log events and reports malformed lines.
- Ranks queries by duration, documents examined, or timestamp.
- Filters by operation, query plan, database, collection, command text, or source file.
- Shows collection scans, index usage, command JSON, raw log events, and execution metrics.
- Keeps the selected-query details panel visible while scrolling the query list on desktop; on narrow screens, details appear below the list.
- Copies a cleaned query command to the clipboard.
