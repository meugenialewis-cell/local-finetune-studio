---
name: Express dotfile storage directories
description: res.download/res.sendFile return 404 when the file path passes through a dotfile-prefixed directory segment.
---

Express's underlying `send` module defaults to `dotfiles: 'ignore'`, which silently 404s any request whose resolved path contains a directory or file segment starting with `.` (e.g. `.data/exports/foo.txt`), even though the file exists on disk and the path is otherwise correct.

**Why:** Discovered while building a local file-based job/export store for an API server — `res.download()` kept 404ing with no useful error even though `fs.existsSync` confirmed the file was present. The only difference was the storage root being named `.data`.

**How to apply:** When choosing a directory for any files that will later be served via `res.download`, `res.sendFile`, or `express.static`, never prefix it with a dot. Use a plain name like `storage/`, `uploads/`, `exports/` (and add it to `.gitignore` if it shouldn't be committed) instead of `.data/`.
