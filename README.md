# Academic Exam Studio

A starter Flask application for instructor-created, scheduled university examinations.

## Features
- Instructor login and exam creation
- UTC scheduled opening/closing and per-student duration
- Multiple-choice question authoring
- Student ID + Exam Code entrance
- Student ID allowlist, one submission per student
- Server-side grading and exam results

## Run locally
1. Install Python 3.10+.
2. `pip install -r requirements.txt`
3. Set `SECRET_KEY` to a securely generated random string.
4. Generate a password hash: `python -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('CHANGE-ME'))"`
5. Set `ADMIN_PASSWORD_HASH` to the result.
6. Run `python app.py`; open http://127.0.0.1:5000.

Times are entered as ISO 8601 UTC (e.g. `2026-11-01T10:00:00+00:00`).
Do **not** use the prototype for high-stakes exams or expose it publicly without production authentication, CSRF protection, rate limits, HTTPS, persistent hosting and thorough testing.
