# Academic Exam Studio — Single Exam Edition

A temporary, online examination platform. The **Cloudflare Worker** in `worker.js` serves students and privately stores results as commits in this repository. The older `app.py` Flask implementation is a prototype and is **not required** for this deployment.

## Deploy (Cloudflare)

1. Install Node.js and run `npx wrangler login`.
2. Copy `exam.config.example.json` to **`exam.config.json`** on the private repository's default branch. Replace the title, schedule, duration, code, student IDs, questions, and correct option indices. Set `enabled: true` only when ready.
3. Create a fine-grained GitHub personal access token scoped **only** to this private repository, with Repository Contents **Read and write** permissions. Treat the token as a secret.
4. Run `npx wrangler secret put GH_TOKEN` and paste the token at the prompt. The token belongs in Cloudflare Secrets, **never in GitHub or the browser**.
5. Run `npx wrangler deploy`. Cloudflare will display the public `*.workers.dev` exam URL.
6. Give students the URL and their unique student ID and exam code.

Config timestamps must be UTC ISO 8601, e.g. `2026-11-01T10:00:00Z`. `durationMinutes` is each student's maximum time; the global closing time also applies.

## Where results are saved

- `exam-data/starts/<STUDENT_ID>.json` — start timestamp; one start per student.
- `exam-data/submissions/<STUDENT_ID>.json` — timestamp, selected answers and score.

**Important limitations before a real exam:** Student ID + Exam Code is not strong authentication. Students could share credentials. The prototype does not autosave incomplete answers, enforce robust rate limits, or provide a private instructor dashboard. Results are committed as individual GitHub files, so the GitHub API rate limits and concurrency behavior need testing for your class size. Use a test exam first. For high-stakes assessments, use stronger identity checking and durable submission processing.

A private GitHub repo does **not** make a deployed web URL private. Keep keys in server-side secrets. Avoid adding full names or other unnecessary personal information to student IDs.

## Disable after your one-time exam

1. Set `enabled: false` in `exam.config.json` to close student access.
2. Delete/disable the Cloudflare Worker when finished.
3. Revoke the GitHub access token.
4. Retain or delete student data according to your institution's policy.
