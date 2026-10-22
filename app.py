import os, sqlite3, secrets, json
from datetime import datetime, timezone, timedelta
from functools import wraps
from flask import Flask, request, session, redirect, url_for, render_template_string, abort
from werkzeug.security import check_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax", SESSION_COOKIE_SECURE=os.environ.get("HTTPS_ONLY") == "1")
DB = os.environ.get("DATABASE", "exam.db")

def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

def setup():
    with conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY, title TEXT NOT NULL, code TEXT UNIQUE NOT NULL, start_at TEXT NOT NULL, end_at TEXT NOT NULL, minutes INTEGER NOT NULL, published INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY, exam_id INTEGER NOT NULL, prompt TEXT NOT NULL, options TEXT NOT NULL, answer INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS students (exam_id INTEGER NOT NULL, student_id TEXT NOT NULL, PRIMARY KEY(exam_id, student_id));
        CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY, exam_id INTEGER NOT NULL, student_id TEXT NOT NULL, started TEXT NOT NULL, finished TEXT, score INTEGER, UNIQUE(exam_id, student_id));
        """)

def utcnow(): return datetime.now(timezone.utc)
def stamp(s): return datetime.fromisoformat(s.replace("Z","+00:00")).astimezone(timezone.utc)
def token():
    if "csrf" not in session: session["csrf"] = secrets.token_urlsafe(32)
    return session["csrf"]

@app.before_request
def csrf_check():
    if request.method == "POST" and not secrets.compare_digest(request.form.get("csrf",""), token()):
        abort(400, "Invalid request token")

def page(title, body, **kwargs):
    shell = """<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{ title }}</title>
    <style>body{font:16px system-ui;background:#f2f5fa;color:#16253d;margin:0}main{max-width:850px;margin:40px auto;background:white;padding:30px;border-radius:15px;box-shadow:0 5px 20px #ccd4e066}nav{background:#162e50;color:white;padding:16px 30px}a{color:#2267b3}input,textarea,button{font:inherit;padding:10px;margin:7px 0;border:1px solid #b9c8d8;border-radius:7px}input,textarea{max-width:100%;box-sizing:border-box}button{background:#1d5fa6;color:white;cursor:pointer}section{border-top:1px solid #dde5ee;margin-top:20px;padding-top:16px}label{display:block;margin:9px 0}.muted{color:#687b8f}</style></head><body><nav>Academic Exam Studio</nav><main><a href="/">Home</a> · <a href="/student">Student Portal</a> · <a href="/admin">Instructor</a><h1>{{ title }}</h1>""" + body + "</main></body></html>"
    return render_template_string(shell, title=title, csrf=token(), **kwargs)

def require_admin(f):
    @wraps(f)
    def wrapper(*args,**kwargs):
        if not session.get("admin"): return redirect("/admin/login")
        return f(*args,**kwargs)
    return wrapper

@app.get("/")
def home(): return page("Welcome", "<p>Build scheduled exams and give students an exam code.</p>")

@app.route("/admin/login", methods=["GET","POST"])
def login():
    if request.method == "POST":
        h=os.environ.get("ADMIN_PASSWORD_HASH","")
        if h and check_password_hash(h,request.form.get("password","")):
            session.clear(); session["admin"]=True
            return redirect("/admin")
        abort(401, "Wrong password")
    return page("Instructor Login", '<form method="post"><input type="hidden" name="csrf" value="{{ csrf }}"><input type="password" name="password" placeholder="Password" required><button>Sign in</button></form>')

@app.post("/admin/logout")
@require_admin
def logout(): session.clear(); return redirect("/")

@app.get("/admin")
@require_admin
def admin():
    with conn() as c: exams=c.execute("SELECT * FROM exams ORDER BY id DESC").fetchall()
    return page("Instructor Dashboard", """<form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="{{ csrf }}"><button>Logout</button></form>
    <h2>New exam</h2><form method="post" action="/admin/create"><input type="hidden" name="csrf" value="{{ csrf }}">
    <label>Title <input name="title" required></label><label>Start (UTC ISO 8601) <input name="start" placeholder="2026-11-01T10:00:00+00:00" required></label>
    <label>End (UTC ISO 8601) <input name="end" placeholder="2026-11-01T11:00:00+00:00" required></label>
    <label>Time limit (minutes) <input type="number" name="minutes" min="1" max="480" value="30" required></label><button>Create exam</button></form>
    <h2>Exams</h2>{% for e in exams %}<p><a href="/admin/exam/{{e.id}}">{{e.title}}</a> — {{e.code}} — {{ "Published" if e.published else "Draft" }}</p>{% endfor %}""",exams=exams)

@app.post("/admin/create")
@require_admin
def create():
    title=request.form.get("title","").strip()[:160]
    try:
        start=stamp(request.form["start"]); end=stamp(request.form["end"]); minutes=int(request.form["minutes"])
        if not title or start>=end or not 1<=minutes<=480: raise ValueError()
    except (ValueError,KeyError): abort(400,"Invalid exam information")
    with conn() as c:
        i=c.execute("INSERT INTO exams(title,code,start_at,end_at,minutes) VALUES(?,?,?,?,?)",(title,secrets.token_hex(4).upper(),start.isoformat(),end.isoformat(),minutes)).lastrowid
    return redirect("/admin/exam/"+str(i))

@app.route("/admin/exam/<int:eid>",methods=["GET","POST"])
@require_admin
def edit(eid):
    with conn() as c:
        e=c.execute("SELECT * FROM exams WHERE id=?",(eid,)).fetchone()
        if e is None: abort(404)
        if request.method=="POST":
            action=request.form.get("action")
            if action=="question" and not e["published"]:
                prompt=request.form.get("prompt","").strip()[:1500]
                choices=[request.form.get("c"+str(n),"").strip()[:400] for n in range(4)]
                try: answer=int(request.form.get("answer",""))
                except ValueError: abort(400)
                if not prompt or not all(choices) or answer not in range(4): abort(400)
                c.execute("INSERT INTO questions(exam_id,prompt,options,answer) VALUES(?,?,?,?)",(eid,prompt,json.dumps(choices),answer))
            elif action=="student" and not e["published"]:
                sid=request.form.get("student_id","").strip()[:80]
                if not sid: abort(400)
                c.execute("INSERT OR IGNORE INTO students VALUES(?,?)",(eid,sid))
            elif action=="publish":
                if c.execute("SELECT COUNT(*) FROM questions WHERE exam_id=?",(eid,)).fetchone()[0]<1: abort(400,"Add a question first")
                c.execute("UPDATE exams SET published=1 WHERE id=?",(eid,))
            else: abort(400,"Action unavailable")
            return redirect(request.path)
        questions=c.execute("SELECT * FROM questions WHERE exam_id=?",(eid,)).fetchall()
        students=c.execute("SELECT student_id FROM students WHERE exam_id=?",(eid,)).fetchall()
        attempts=c.execute("SELECT student_id,score,finished FROM attempts WHERE exam_id=?",(eid,)).fetchall()
    return page("Edit: "+e["title"], """<p><b>Exam code:</b> {{e.code}} · {{e.start_at}} – {{e.end_at}} UTC · {{e.minutes}} min · {{ "Published" if e.published else "Draft" }}</p>
    {% if not e.published %}<section><h2>Add multiple-choice question</h2><form method="post"><input type="hidden" name="csrf" value="{{ csrf }}"><input type="hidden" name="action" value="question">
    <textarea name="prompt" placeholder="Question" required></textarea>{% for n in range(4) %}<label>Option {{n+1}} <input name="c{{n}}" required></label>{% endfor %}
    <label>Correct option (1–4) <input type="number" name="answer" min="0" max="3" required></label><p class="muted">Enter 0 for first option, 1 for second, etc.</p><button>Add question</button></form></section>
    <section><h2>Register student ID</h2><form method="post"><input type="hidden" name="csrf" value="{{ csrf }}"><input type="hidden" name="action" value="student"><input name="student_id" required><button>Add student</button></form></section>
    <form method="post"><input type="hidden" name="csrf" value="{{ csrf }}"><input type="hidden" name="action" value="publish"><button>Publish exam</button></form>{% endif %}
    <section><h2>Questions ({{questions|length}})</h2>{% for q in questions %}<p>{{q.prompt}}</p>{% endfor %}</section>
    <section><h2>Students ({{students|length}})</h2>{% for s in students %}<span>{{s.student_id}} · </span>{% endfor %}</section>
    <section><h2>Results</h2>{% for a in attempts %}<p>{{a.student_id}} — {{a.score if a.finished else "In progress"}}</p>{% endfor %}</section>""",e=e,questions=questions,students=students,attempts=attempts)

@app.route("/student",methods=["GET","POST"])
def student():
    if request.method=="POST":
        sid=request.form.get("student_id","").strip()
        code=request.form.get("code","").strip().upper()
        with conn() as c:
            exam=c.execute("SELECT * FROM exams WHERE code=? AND published=1",(code,)).fetchone()
            if not exam or not(stamp(exam["start_at"])<=utcnow()<stamp(exam["end_at"])): abort(403,"Exam not open")
            if not c.execute("SELECT 1 FROM students WHERE exam_id=? AND student_id=?",(exam["id"],sid)).fetchone(): abort(403,"Not registered")
            if c.execute("SELECT 1 FROM attempts WHERE exam_id=? AND student_id=?",(exam["id"],sid)).fetchone(): abort(403,"Attempt already used")
            a=c.execute("INSERT INTO attempts(exam_id,student_id,started) VALUES(?,?,?)",(exam["id"],sid,utcnow().isoformat())).lastrowid
        session["attempt"]=a
        return redirect("/take/"+str(a))
    return page("Student Portal", '<form method="post"><input type="hidden" name="csrf" value="{{ csrf }}"><label>Student ID <input name="student_id" required></label><label>Exam Code <input name="code" required></label><button>Start exam</button></form>')

@app.route("/take/<int:aid>",methods=["GET","POST"])
def take(aid):
    if session.get("attempt")!=aid: abort(403)
    with conn() as c:
        a=c.execute("SELECT a.*,e.title,e.end_at,e.minutes FROM attempts a JOIN exams e ON a.exam_id=e.id WHERE a.id=?",(aid,)).fetchone()
        if not a: abort(404)
        if a["finished"]: return page("Submitted","<p>Your exam is already submitted.</p>")
        limit=min(stamp(a["end_at"]),stamp(a["started"])+timedelta(minutes=a["minutes"]))
        questions=c.execute("SELECT * FROM questions WHERE exam_id=? ORDER BY id",(a["exam_id"],)).fetchall()
        if request.method=="POST" or utcnow()>=limit:
            score=0
            if utcnow()<limit:
                for q in questions:
                    if request.form.get("q"+str(q["id"]))==str(q["answer"]): score+=1
            c.execute("UPDATE attempts SET finished=?,score=? WHERE id=? AND finished IS NULL",(utcnow().isoformat(),score,aid))
            return page("Submitted","<p>Your exam has been received.</p>")
    items=[{"id":q["id"],"prompt":q["prompt"],"options":json.loads(q["options"])} for q in questions]
    return page(a["title"], """<p><b>Deadline (UTC):</b> {{limit.isoformat()}}</p><form method="post">
    <input type="hidden" name="csrf" value="{{csrf}}">{% for q in items %}<section><h3>{{loop.index}}. {{q.prompt}}</h3>
    {% for option in q.options %}<label><input type="radio" name="q{{q.id}}" value="{{loop.index0}}"> {{option}}</label>{% endfor %}</section>{% endfor %}
    <button>Submit exam</button></form><p class="muted">Submit before the deadline. Unsaved responses are not retained if you refresh.</p>""",items=items,limit=limit)

setup()
if __name__=="__main__": app.run(debug=False)
