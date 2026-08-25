#!/usr/bin/env python3
import os, json, sqlite3, secrets, hashlib, hmac, mimetypes, urllib.parse, time, random, re
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
DB_PATH = Path(os.getenv('SUDOKU_DB', str(ROOT / 'data' / 'sudoku.db')))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
HOST = os.getenv('SUDOKU_HOST', '0.0.0.0')
PORT = int(os.getenv('SUDOKU_PORT', '8080'))
SESSION_DAYS = 30

DEFAULT_PERMS = {
    'play': True,
    'learn': True,
    'custom': True,
    'generator': True,
    'analysis': True,
    'candidate_mode': True,
    'auto_notes': True,
    'undo_redo': True,
    'hints': True,
    'hint_history': True,
    'cell_analysis': True,
    'replay': True,
    'leaderboard': True,
    'max_hints': 3,
}

PUZZLES = []
BUILTIN_PUZZLES = []


def now():
    return datetime.now(timezone.utc).isoformat()


def db():
    c = sqlite3.connect(DB_PATH, timeout=20)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    return c


def audit_log(user_id=None, username='', category='operation', module='server', action='', status='ok', detail=None, ip=''):
    try:
        payload = detail if isinstance(detail, str) else json.dumps(detail or {}, ensure_ascii=False, separators=(',', ':'))
        with db() as c:
            c.execute('INSERT INTO audit_logs(user_id,username,category,module,action,status,detail,ip,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
                      (user_id, username or '', category, module, action, status, payload[:12000], ip or '', now()))
    except Exception as e:
        print('audit log failed:', e)


def pw_hash(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 210000)
    return salt.hex() + ':' + dk.hex()


def pw_ok(password, stored):
    try:
        s, h = stored.split(':', 1)
        salt = bytes.fromhex(s)
        chk = pw_hash(password, salt).split(':', 1)[1]
        return hmac.compare_digest(chk, h)
    except Exception:
        return False


def json_loads_safe(s, default):
    try:
        return json.loads(s) if s else default
    except Exception:
        return default


def user_dict(r):
    d = dict(r)
    d.pop('password_hash', None)
    d['permissions'] = {**DEFAULT_PERMS, **json_loads_safe(d.get('permissions'), {})}
    d['active'] = bool(d.get('active'))
    d['must_change_password'] = bool(d.get('must_change_password'))
    return d


def validate_and_solve_puzzle(puzzle):
    b = [int(ch) for ch in puzzle]
    units = []
    for r in range(9): units.append([r*9+c for c in range(9)])
    for c in range(9): units.append([r*9+c for r in range(9)])
    for br in range(0,9,3):
        for bc in range(0,9,3): units.append([(br+r)*9+bc+c for r in range(3) for c in range(3)])
    peers = []
    for i in range(81):
        ps=set()
        for u in units:
            if i in u: ps.update(u)
        ps.discard(i); peers.append(ps)
    for u in units:
        vals=[b[i] for i in u if b[i]]
        if len(vals)!=len(set(vals)):
            return 0, None, '题目存在行/列/宫重复数字'
    count=0; first=None
    def cand(i):
        used={b[p] for p in peers[i] if b[p]}
        return [n for n in range(1,10) if n not in used]
    def search():
        nonlocal count, first
        if count>=2: return
        empties=[i for i,v in enumerate(b) if not v]
        if not empties:
            count += 1
            if first is None: first=b[:]
            return
        best=None; opts=None
        for i in empties:
            c=cand(i)
            if not c: return
            if opts is None or len(c)<len(opts):
                best,opts=i,c
                if len(opts)==1: break
        for n in opts:
            b[best]=n; search(); b[best]=0
            if count>=2: return
    search()
    return count, first, None

def parse_puzzle_item(item, idx=1, source='admin'):
    if not isinstance(item, dict):
        raise ValueError(f'第 {idx} 条题目不是对象')
    level = str(item.get('level') or 'medium').strip().lower()
    if level not in ('beginner', 'easy', 'medium', 'hard', 'expert', 'master'):
        raise ValueError(f'第 {idx} 条题目难度不正确')
    puzzle = re.sub(r'[^0-9.]', '', str(item.get('puzzle') or '').strip()).replace('.', '0')
    solution = re.sub(r'[^0-9]', '', str(item.get('solution') or '').strip())
    if len(puzzle) != 81:
        raise ValueError(f'第 {idx} 条题目 puzzle 长度必须为81')
    if solution and len(solution) != 81:
        raise ValueError(f'第 {idx} 条题目 solution 长度必须为81')
    count, auto_solution, conflict_error = validate_and_solve_puzzle(puzzle)
    if conflict_error:
        raise ValueError(f'第 {idx} 条题目：{conflict_error}')
    if count == 0:
        raise ValueError(f'第 {idx} 条题目无解')
    if count > 1:
        raise ValueError(f'第 {idx} 条题目不是唯一解')
    solved_text = ''.join(map(str, auto_solution))
    if solution and solution != solved_text:
        raise ValueError(f'第 {idx} 条题目的 solution 与计算得到的唯一解不一致')
    solution = solved_text
    code = str(item.get('id') or item.get('code') or f'ADM-{int(time.time())}-{idx}').strip()
    title = str(item.get('title') or code).strip()
    clues = sum(1 for ch in puzzle if ch != '0')
    tags = item.get('tags') or []
    if isinstance(tags, str):
        tags = [x.strip() for x in tags.split(',') if x.strip()]
    return {
        'code': code,
        'title': title,
        'level': level,
        'puzzle': puzzle,
        'solution': solution,
        'source': str(item.get('source') or source),
        'clues': int(item.get('clues') or clues),
        'tags': tags,
    }


def init_db():
    with db() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          permissions TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          must_change_password INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions(
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS progress(
          user_id INTEGER NOT NULL,
          game_key TEXT NOT NULL,
          state TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(user_id, game_key)
        );
        CREATE TABLE IF NOT EXISTS hints(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          game_key TEXT NOT NULL,
          seq INTEGER NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS results(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          puzzle_id TEXT NOT NULL,
          level TEXT NOT NULL,
          seconds INTEGER NOT NULL,
          mistakes INTEGER NOT NULL,
          hints INTEGER NOT NULL,
          score INTEGER NOT NULL,
          completed_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS lesson_progress(
          user_id INTEGER NOT NULL,
          lesson_id INTEGER NOT NULL,
          completed_at TEXT NOT NULL,
          PRIMARY KEY(user_id, lesson_id)
        );
        CREATE TABLE IF NOT EXISTS audit_logs(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          username TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL,
          module TEXT NOT NULL,
          action TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ok',
          detail TEXT NOT NULL DEFAULT '',
          ip TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id,created_at DESC);
        CREATE TABLE IF NOT EXISTS admin_puzzles(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          level TEXT NOT NULL,
          puzzle TEXT NOT NULL,
          solution TEXT,
          source TEXT NOT NULL DEFAULT 'admin',
          clues INTEGER NOT NULL DEFAULT 0,
          tags TEXT NOT NULL DEFAULT '[]',
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        );
        ''')
        if c.execute('SELECT COUNT(*) n FROM users').fetchone()['n'] == 0:
            u = os.getenv('SUDOKU_ADMIN_USER', 'admin')
            p = os.getenv('SUDOKU_ADMIN_PASSWORD', 'Sudoku@2026')
            c.execute(
                'INSERT INTO users(username,display_name,password_hash,role,permissions,active,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?)',
                (u, '管理员', pw_hash(p), 'admin', json.dumps({**DEFAULT_PERMS, 'max_hints': 99}, ensure_ascii=False), 1, 1, now())
            )
            print(f'[Sudoku] first admin: {u} / {p}')


def load_builtin_puzzles():
    try:
        obj = json.loads((PUBLIC / 'data' / 'puzzles.json').read_text(encoding='utf-8'))
        return obj.get('puzzles', [])
    except Exception as e:
        print('builtin puzzle load failed:', e)
        return []


def load_all_puzzles():
    rows = []
    with db() as c:
        rs = c.execute('SELECT * FROM admin_puzzles WHERE active=1 ORDER BY id DESC').fetchall()
        for r in rs:
            rows.append({
                'id': r['code'],
                'title': r['title'],
                'level': r['level'],
                'levelName': r['level'],
                'puzzle': r['puzzle'],
                'solution': r['solution'] or '',
                'source': r['source'] or 'admin',
                'clues': r['clues'],
                'tags': json_loads_safe(r['tags'], []),
            })
    return BUILTIN_PUZZLES + rows


def reload_puzzles():
    global PUZZLES
    PUZZLES = load_all_puzzles()


def parse_cookie(req):
    out = {}
    for part in req.headers.get('Cookie', '').split(';'):
        if '=' in part:
            k, v = part.strip().split('=', 1)
            out[k] = v
    return out


def auth(req):
    token = parse_cookie(req).get('sudoku_session')
    if not token:
        return None
    with db() as c:
        r = c.execute(
            'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.active=1',
            (token, int(time.time()))
        ).fetchone()
    return user_dict(r) if r else None


def json_body(req):
    n = int(req.headers.get('Content-Length', '0') or 0)
    if n > 8_000_000:
        raise ValueError('payload too large')
    return json.loads(req.rfile.read(n) or b'{}')


def score(seconds, mistakes, hints, level):
    weight = {'beginner': 1, 'easy': 2, 'medium': 3, 'hard': 4, 'expert': 5, 'master': 6}.get(level, 1)
    return max(100, weight * 10000 - seconds * 2 - mistakes * 400 - hints * 600)


class H(BaseHTTPRequestHandler):
    server_version = 'SudokuStudio/3.2.4'

    def log_message(self, fmt, *args):
        print('%s - %s' % (self.address_string(), fmt % args))

    def audit(self, category, module, action, status='ok', detail=None, user=None, username=''):
        try:
            u = user if user is not None else auth(self)
            audit_log(u.get('id') if u else None, (u.get('username') if u else username) or '', category, module, action, status, detail or {}, self.client_address[0] if self.client_address else '')
        except Exception:
            pass

    def send_json(self, obj, status=200, cookie=None):
        b = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Cache-Control', 'no-store')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(b)

    def err(self, msg, status=400):
        try: self.audit('error', 'server', urllib.parse.urlparse(self.path).path, 'error', {'status': status, 'message': msg})
        except Exception: pass
        self.send_json({'ok': False, 'error': msg}, status)

    def redirect(self, loc, status=302):
        self.send_response(status)
        self.send_header('Location', loc)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()

    def need(self, perm=None, admin=False):
        u = auth(self)
        if not u:
            self.err('请先登录', 401)
            return None
        if u.get('must_change_password') and self.path.startswith('/api/') and self.path not in ('/api/auth/me', '/api/auth/password', '/api/auth/logout'):
            self.err('请先修改初始密码', 428)
            return None
        if admin and u['role'] != 'admin':
            self.err('需要管理员权限', 403)
            return None
        if perm and u['role'] != 'admin' and not u['permissions'].get(perm, False):
            self.err('当前用户没有此功能权限', 403)
            return None
        return u

    def serve_file(self, path):
        f = PUBLIC / path
        try:
            f = f.resolve()
            public = PUBLIC.resolve()
        except Exception:
            return self.err('invalid path', 400)
        if public not in f.parents and f != public:
            return self.err('forbidden', 403)
        if not f.is_file():
            return self.err('not found', 404)
        b = f.read_bytes()
        ctype = mimetypes.guess_type(str(f))[0] or 'application/octet-stream'
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Cache-Control', 'no-store' if f.suffix in ('.html', '.js', '.css') else 'public, max-age=3600')
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        path = p.path
        q = urllib.parse.parse_qs(p.query)

        if path in ('/', '/login', '/login.html'):
            u = auth(self)
            if u:
                return self.redirect('/change-password.html' if u['must_change_password'] else '/app.html')
            return self.serve_file(Path('login.html'))
        if path in ('/change-password', '/change-password.html'):
            u = auth(self)
            if not u:
                return self.redirect('/')
            if not u['must_change_password']:
                return self.redirect('/app.html')
            return self.serve_file(Path('change-password.html'))
        if path in ('/app', '/app.html'):
            u = auth(self)
            if not u:
                return self.redirect('/')
            if u['must_change_password']:
                return self.redirect('/change-password.html')
            return self.serve_file(Path('app.html'))
        if path in ('/app.js', '/engine.js', '/lessons.js', '/app.css'):
            u = auth(self)
            if not u or u['must_change_password']:
                return self.err('unauthorized', 401)
            return self.serve_file(Path(path.lstrip('/')))
        if path == '/auth.css':
            return self.serve_file(Path('auth.css'))
        # Public branding/static assets must be available before login as well.
        if path.startswith('/assets/'):
            return self.serve_file(Path(path.lstrip('/')))

        if path == '/api/health':
            return self.send_json({'ok': True, 'version': '3.2.8', 'time': now(), 'puzzles': len(PUZZLES)})
        if path == '/api/auth/me':
            u = auth(self)
            return self.send_json({'ok': bool(u), 'user': u}, 200 if u else 401)
        if path == '/api/progress/current':
            u = self.need('play')
            if not u:
                return
            with db() as c:
                r = c.execute('SELECT game_key,state,updated_at FROM progress WHERE user_id=? AND completed=0 ORDER BY updated_at DESC LIMIT 1', (u['id'],)).fetchone()
            item = dict(r) if r else None
            if item and item.get('state'):
                item['state'] = json_loads_safe(item['state'], {})
            return self.send_json({'ok': True, 'progress': item})
        if path == '/api/progress':
            u = self.need('play')
            if not u:
                return
            key = (q.get('game_key') or [''])[0]
            with db() as c:
                r = c.execute('SELECT * FROM progress WHERE user_id=? AND game_key=?', (u['id'], key)).fetchone()
            item = dict(r) if r else None
            if item and item.get('state'):
                item['state'] = json_loads_safe(item['state'], {})
            return self.send_json({'ok': True, 'progress': item})
        if path == '/api/hints':
            u = self.need('hint_history')
            if not u:
                return
            key = (q.get('game_key') or [''])[0]
            with db() as c:
                rs = c.execute('SELECT seq,payload,created_at FROM hints WHERE user_id=? AND game_key=? ORDER BY seq', (u['id'], key)).fetchall()
            return self.send_json({'ok': True, 'hints': [{'seq': r['seq'], 'payload': json_loads_safe(r['payload'], {}), 'created_at': r['created_at']} for r in rs]})
        if path == '/api/puzzles/random':
            u = self.need('play')
            if not u:
                return
            level = (q.get('level') or ['medium'])[0]
            source = (q.get('source') or [''])[0]
            arr = [x for x in PUZZLES if x.get('level') == level] or PUZZLES
            if source:
                arr = [x for x in arr if x.get('source') == source] or arr
            return self.send_json({'ok': True, 'puzzle': random.choice(arr)}) if arr else self.err('题库为空', 500)
        if path == '/api/daily':
            u = self.need('play')
            if not u:
                return
            date = (q.get('date') or [datetime.now().date().isoformat()])[0]
            if not PUZZLES:
                return self.err('题库为空', 500)
            idx = int(hashlib.sha256(date.encode()).hexdigest()[:8], 16) % len(PUZZLES)
            return self.send_json({'ok': True, 'date': date, 'puzzle': PUZZLES[idx]})
        if path == '/api/results':
            u = self.need('play')
            if not u:
                return
            with db() as c:
                rs = c.execute('SELECT * FROM results WHERE user_id=? ORDER BY id DESC LIMIT 100', (u['id'],)).fetchall()
            return self.send_json({'ok': True, 'results': [dict(x) for x in rs]})
        if path == '/api/leaderboard':
            u = self.need('leaderboard')
            if not u:
                return
            level = (q.get('level') or ['all'])[0]
            args = []
            sql = 'SELECT r.*,u.display_name FROM results r JOIN users u ON u.id=r.user_id WHERE u.active=1'
            if level != 'all':
                sql += ' AND r.level=?'
                args.append(level)
            sql += ' ORDER BY r.score DESC,r.seconds ASC LIMIT 100'
            with db() as c:
                rs = c.execute(sql, args).fetchall()
            return self.send_json({'ok': True, 'rows': [dict(x) for x in rs]})
        if path == '/api/lessons/progress':
            u = self.need('learn')
            if not u:
                return
            with db() as c:
                rs = c.execute('SELECT lesson_id,completed_at FROM lesson_progress WHERE user_id=? ORDER BY lesson_id', (u['id'],)).fetchall()
            return self.send_json({'ok': True, 'completed': [dict(x) for x in rs]})
        if path == '/api/stats/overview':
            u = self.need()
            if not u:
                return
            with db() as c:
                if u['role'] == 'admin':
                    admin_stats = {
                        'users': c.execute('SELECT COUNT(*) n FROM users').fetchone()['n'],
                        'active_users': c.execute('SELECT COUNT(*) n FROM users WHERE active=1').fetchone()['n'],
                        'results': c.execute('SELECT COUNT(*) n FROM results').fetchone()['n'],
                        'puzzles_total': len(PUZZLES),
                        'puzzles_admin': c.execute('SELECT COUNT(*) n FROM admin_puzzles WHERE active=1').fetchone()['n'],
                    }
                else:
                    admin_stats = None
                total_completed = c.execute('SELECT COUNT(*) n FROM results WHERE user_id=?', (u['id'],)).fetchone()['n']
                best_score = c.execute('SELECT COALESCE(MAX(score),0) s FROM results WHERE user_id=?', (u['id'],)).fetchone()['s']
                avg_seconds = c.execute('SELECT COALESCE(AVG(seconds),0) s FROM results WHERE user_id=?', (u['id'],)).fetchone()['s']
                lessons_done = c.execute('SELECT COUNT(*) n FROM lesson_progress WHERE user_id=?', (u['id'],)).fetchone()['n']
                rs = c.execute('SELECT level, COUNT(*) n, MIN(seconds) best_seconds, COALESCE(AVG(seconds),0) avg_seconds, COALESCE(MAX(score),0) best_score FROM results WHERE user_id=? GROUP BY level', (u['id'],)).fetchall()
                levels = [dict(x) for x in rs]
                recent = c.execute('SELECT puzzle_id,level,seconds,mistakes,hints,score,completed_at FROM results WHERE user_id=? ORDER BY id DESC LIMIT 8', (u['id'],)).fetchall()
                usage = c.execute('SELECT COUNT(*) n FROM progress WHERE user_id=? AND completed=0', (u['id'],)).fetchone()['n']
            return self.send_json({'ok': True, 'overview': {
                'total_completed': total_completed,
                'best_score': int(best_score or 0),
                'avg_seconds': float(avg_seconds or 0),
                'lessons_done': lessons_done,
                'unfinished_games': usage,
                'levels': levels,
                'recent': [dict(x) for x in recent],
                'admin': admin_stats,
            }})
        if path == '/api/logs':
            u = self.need(admin=True)
            if not u:
                return
            category = (q.get('category') or [''])[0].strip()
            module = (q.get('module') or [''])[0].strip()
            search = (q.get('q') or [''])[0].strip()
            try: limit = max(1, min(1000, int((q.get('limit') or ['300'])[0])))
            except Exception: limit = 300
            where=[]; args=[]
            if category: where.append('category=?'); args.append(category)
            if module: where.append('module=?'); args.append(module)
            if search:
                where.append('(username LIKE ? OR action LIKE ? OR detail LIKE ? OR ip LIKE ?)')
                pat=f'%{search}%'; args.extend([pat,pat,pat,pat])
            sql='SELECT id,user_id,username,category,module,action,status,detail,ip,created_at FROM audit_logs'
            if where: sql += ' WHERE ' + ' AND '.join(where)
            sql += ' ORDER BY id DESC LIMIT ?'; args.append(limit)
            with db() as c: rows=[dict(r) for r in c.execute(sql,args).fetchall()]
            return self.send_json({'ok':True,'items':rows})
        if path == '/api/users':
            u = self.need(admin=True)
            if not u:
                return
            with db() as c:
                rs = c.execute('SELECT * FROM users ORDER BY id').fetchall()
            return self.send_json({'ok': True, 'users': [user_dict(x) for x in rs]})
        if path == '/api/puzzles':
            u = self.need(admin=True)
            if not u:
                return
            level = (q.get('level') or [''])[0]
            source = (q.get('source') or [''])[0]
            qword = (q.get('q') or [''])[0].strip().lower()
            with db() as c:
                rs = c.execute('SELECT * FROM admin_puzzles ORDER BY id DESC LIMIT 1000').fetchall()
            items = []
            for r in rs:
                item = dict(r)
                item['tags'] = json_loads_safe(item.get('tags'), [])
                if level and item['level'] != level:
                    continue
                if source and item['source'] != source:
                    continue
                hay = (item['code'] + ' ' + item['title'] + ' ' + ' '.join(item['tags'])).lower()
                if qword and qword not in hay:
                    continue
                items.append(item)
            return self.send_json({'ok': True, 'items': items, 'builtin_count': len(BUILTIN_PUZZLES), 'all_count': len(PUZZLES)})
        return self.err('not found', 404)

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        try:
            data = json_body(self)
        except Exception as e:
            return self.err(str(e))

        if path == '/api/log':
            u = self.need()
            if not u:
                return
            category=str(data.get('category') or 'operation')[:40]
            module=str(data.get('module') or 'frontend')[:80]
            action=str(data.get('action') or 'event')[:120]
            status=str(data.get('status') or 'ok')[:20]
            detail=data.get('detail') or {}
            self.audit(category,module,action,status,detail,user=u)
            return self.send_json({'ok':True})
        if path == '/api/auth/login':
            name = str(data.get('username', '')).strip()
            pw = str(data.get('password', ''))
            with db() as c:
                r = c.execute('SELECT * FROM users WHERE username=? AND active=1', (name,)).fetchone()
            if not r or not pw_ok(pw, r['password_hash']):
                audit_log(None, name, 'auth', 'auth', 'login_failed', 'error', {'reason':'bad_credentials'}, self.client_address[0] if self.client_address else '')
                return self.err('用户名或密码错误', 401)
            token = secrets.token_urlsafe(32)
            exp = int(time.time() + SESSION_DAYS * 86400)
            with db() as c:
                c.execute('DELETE FROM sessions WHERE user_id=? AND expires_at<?', (r['id'], int(time.time())))
                c.execute('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)', (token, r['id'], exp))
            cookie = f'sudoku_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_DAYS*86400}'
            audit_log(r['id'], r['username'], 'auth', 'auth', 'login_success', 'ok', {}, self.client_address[0] if self.client_address else '')
            return self.send_json({'ok': True, 'user': user_dict(r), 'next': '/change-password.html' if r['must_change_password'] else '/app.html'}, cookie=cookie)
        if path == '/api/auth/logout':
            old_user = auth(self)
            token = parse_cookie(self).get('sudoku_session')
            if token:
                with db() as c:
                    c.execute('DELETE FROM sessions WHERE token=?', (token,))
            if old_user: self.audit('auth','auth','logout','ok',{},user=old_user)
            return self.send_json({'ok': True}, cookie='sudoku_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
        if path == '/api/auth/password':
            u = auth(self)
            if not u:
                return self.err('请先登录', 401)
            old = str(data.get('old_password', ''))
            new = str(data.get('new_password', ''))
            if len(new) < 8:
                return self.err('新密码至少8位')
            with db() as c:
                r = c.execute('SELECT password_hash FROM users WHERE id=?', (u['id'],)).fetchone()
            if not pw_ok(old, r['password_hash']):
                return self.err('原密码错误', 403)
            with db() as c:
                c.execute('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?', (pw_hash(new), u['id']))
            self.audit('auth','auth','password_changed','ok',{},user=u)
            return self.send_json({'ok': True, 'next': '/app.html'})
        if path == '/api/progress/save':
            u = self.need('play')
            if not u:
                return
            key = str(data.get('game_key', ''))
            state = data.get('state')
            if not key or state is None:
                return self.err('缺少进度数据')
            completed = 1 if data.get('completed') else 0
            with db() as c:
                c.execute('''
                    INSERT INTO progress(user_id,game_key,state,updated_at,completed)
                    VALUES(?,?,?,?,?)
                    ON CONFLICT(user_id,game_key)
                    DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at,completed=excluded.completed
                ''', (u['id'], key, json.dumps(state, ensure_ascii=False), now(), completed))
            return self.send_json({'ok': True, 'updated_at': now()})
        if path == '/api/hints':
            u = self.need('hints')
            if not u:
                return
            key = str(data.get('game_key', ''))
            payload = data.get('payload') or {}
            if not key:
                return self.err('缺少 game_key')
            with db() as c:
                n = c.execute('SELECT COUNT(*) n FROM hints WHERE user_id=? AND game_key=?', (u['id'], key)).fetchone()['n']
                limit = 999 if u['role'] == 'admin' else int(u['permissions'].get('max_hints', 3))
                if n >= limit:
                    return self.err(f'本题提示次数已达到上限 {limit}', 403)
                c.execute('INSERT INTO hints(user_id,game_key,seq,payload,created_at) VALUES(?,?,?,?,?)', (u['id'], key, n + 1, json.dumps(payload, ensure_ascii=False), now()))
            self.audit('operation','game','hint_created','ok',{'game_key':key,'seq':n+1,'type':payload.get('type')},user=u)
            return self.send_json({'ok': True, 'seq': n + 1, 'remaining': max(0, limit - n - 1)})
        if path == '/api/hints/reveal':
            u = self.need('hints')
            if not u:
                return
            key = str(data.get('game_key', ''))
            try:
                seq = int(data.get('seq', 0)); level = int(data.get('level', 1))
            except Exception:
                return self.err('提示层级参数错误')
            if not key or seq < 1 or level not in (2, 3):
                return self.err('提示层级参数错误')
            with db() as c:
                r = c.execute('SELECT payload FROM hints WHERE user_id=? AND game_key=? AND seq=?', (u['id'], key, seq)).fetchone()
                if not r:
                    return self.err('提示记录不存在', 404)
                payload = json_loads_safe(r['payload'], {})
                current = int(payload.get('revealedLevel', 1) or 1)
                if level > current + 1:
                    return self.err('请按顺序逐层查看提示', 400)
                payload['revealedLevel'] = max(current, level)
                c.execute('UPDATE hints SET payload=? WHERE user_id=? AND game_key=? AND seq=?', (json.dumps(payload, ensure_ascii=False), u['id'], key, seq))
            return self.send_json({'ok': True, 'seq': seq, 'revealedLevel': payload['revealedLevel']})
        if path == '/api/results':
            u = self.need('play')
            if not u:
                return
            sec = int(data.get('seconds', 0))
            mis = int(data.get('mistakes', 0))
            hnt = int(data.get('hints', 0))
            lvl = str(data.get('level', 'beginner'))
            pid = str(data.get('puzzle_id', ''))
            sc = score(sec, mis, hnt, lvl)
            with db() as c:
                c.execute('INSERT INTO results(user_id,puzzle_id,level,seconds,mistakes,hints,score,completed_at) VALUES(?,?,?,?,?,?,?,?)', (u['id'], pid, lvl, sec, mis, hnt, sc, now()))
            return self.send_json({'ok': True, 'score': sc})
        if path == '/api/lessons/complete':
            u = self.need('learn')
            if not u:
                return
            try:
                lesson_id = int(data.get('lesson_id'))
            except Exception:
                return self.err('课程编号错误')
            with db() as c:
                c.execute('''
                  INSERT INTO lesson_progress(user_id,lesson_id,completed_at)
                  VALUES(?,?,?)
                  ON CONFLICT(user_id,lesson_id) DO UPDATE SET completed_at=excluded.completed_at
                ''', (u['id'], lesson_id, now()))
            return self.send_json({'ok': True, 'lesson_id': lesson_id})
        if path == '/api/users':
            u = self.need(admin=True)
            if not u:
                return
            name = str(data.get('username', '')).strip()
            dn = str(data.get('display_name') or name)
            pw = str(data.get('password', ''))
            if not name or len(pw) < 8:
                return self.err('用户名不能为空，初始密码至少8位')
            perms = {**DEFAULT_PERMS, **(data.get('permissions') or {})}
            role = str(data.get('role', 'user'))
            try:
                with db() as c:
                    cur = c.execute('INSERT INTO users(username,display_name,password_hash,role,permissions,active,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?)', (name, dn, pw_hash(pw), role, json.dumps(perms, ensure_ascii=False), 1, 1, now()))
                    uid = cur.lastrowid
                self.audit('admin','user','user_created','ok',{'user_id':uid,'username':name,'role':role},user=u)
                return self.send_json({'ok': True, 'id': uid})
            except sqlite3.IntegrityError:
                return self.err('用户名已存在', 409)
        if path == '/api/puzzles':
            u = self.need(admin=True)
            if not u:
                return
            try:
                item = parse_puzzle_item(data, 1, source='admin')
            except Exception as e:
                return self.err(str(e))
            try:
                with db() as c:
                    cur = c.execute('INSERT INTO admin_puzzles(code,title,level,puzzle,solution,source,clues,tags,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', (item['code'], item['title'], item['level'], item['puzzle'], item['solution'], item['source'], item['clues'], json.dumps(item['tags'], ensure_ascii=False), 1, now()))
                    pid = cur.lastrowid
                reload_puzzles()
                self.audit('admin','puzzle','puzzle_created','ok',{'id':item['code'],'level':item['level']},user=u)
                return self.send_json({'ok': True, 'id': pid})
            except sqlite3.IntegrityError:
                return self.err('题目编号已存在', 409)
        if path == '/api/puzzles/import':
            u = self.need(admin=True)
            if not u:
                return
            items = data.get('items')
            if not isinstance(items, list) or not items:
                return self.err('没有可导入题目')
            parsed = []
            seen = set()
            for i, item in enumerate(items, start=1):
                try:
                    p = parse_puzzle_item(item, i, source='import')
                except Exception as e:
                    return self.err(str(e))
                if p['code'] in seen:
                    return self.err(f'导入包中编号重复：{p["code"]}')
                seen.add(p['code'])
                parsed.append(p)
            added = 0
            skipped = 0
            with db() as c:
                for pz in parsed:
                    try:
                        c.execute('INSERT INTO admin_puzzles(code,title,level,puzzle,solution,source,clues,tags,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', (pz['code'], pz['title'], pz['level'], pz['puzzle'], pz['solution'], pz['source'], pz['clues'], json.dumps(pz['tags'], ensure_ascii=False), 1, now()))
                        added += 1
                    except sqlite3.IntegrityError:
                        skipped += 1
            reload_puzzles()
            self.audit('admin','puzzle','puzzles_imported','ok',{'added':added,'skipped':skipped},user=u)
            return self.send_json({'ok': True, 'added': added, 'skipped': skipped})
        return self.err('接口不存在', 404)

    def do_PUT(self):
        path = urllib.parse.urlparse(self.path).path
        if path.startswith('/api/users/'):
            u = self.need(admin=True)
            if not u:
                return
            try:
                uid = int(path.rsplit('/', 1)[1])
                data = json_body(self)
            except Exception:
                return self.err('参数错误')
            sets, args = [], []
            for k in ('display_name', 'role'):
                if k in data:
                    sets.append(k + '=?')
                    args.append(str(data[k]))
            if 'active' in data:
                sets.append('active=?')
                args.append(1 if data['active'] else 0)
            if 'permissions' in data:
                sets.append('permissions=?')
                args.append(json.dumps({**DEFAULT_PERMS, **data['permissions']}, ensure_ascii=False))
            if 'password' in data:
                if len(str(data['password'])) < 8:
                    return self.err('密码至少8位')
                sets += ['password_hash=?', 'must_change_password=?']
                args += [pw_hash(str(data['password'])), 1]
            if not sets:
                return self.send_json({'ok': True})
            args.append(uid)
            with db() as c:
                c.execute('UPDATE users SET ' + ','.join(sets) + ' WHERE id=?', args)
            self.audit('admin','user','user_updated','ok',{'target_user_id':uid,'fields':sets},user=u)
            return self.send_json({'ok': True})
        if path.startswith('/api/puzzles/'):
            u = self.need(admin=True)
            if not u:
                return
            code = urllib.parse.unquote(path.rsplit('/', 1)[1])
            data = json_body(self)
            fields, args = [], []
            for k in ('title', 'level', 'puzzle', 'solution', 'source'):
                if k in data:
                    fields.append(k + '=?')
                    val = re.sub(r'[^0-9.]', '', str(data[k])).replace('.', '0') if k in ('puzzle', 'solution') else str(data[k])
                    args.append(val)
            if 'tags' in data:
                fields.append('tags=?')
                args.append(json.dumps(data['tags'] if isinstance(data['tags'], list) else [], ensure_ascii=False))
            if 'active' in data:
                fields.append('active=?')
                args.append(1 if data['active'] else 0)
            if not fields:
                return self.send_json({'ok': True})
            args.append(code)
            with db() as c:
                c.execute('UPDATE admin_puzzles SET ' + ','.join(fields) + ' WHERE code=?', args)
            reload_puzzles()
            self.audit('admin','puzzle','puzzle_updated','ok',{'code':code,'fields':fields},user=u)
            return self.send_json({'ok': True})
        return self.err('接口不存在', 404)

    def do_DELETE(self):
        path = urllib.parse.urlparse(self.path).path
        if path.startswith('/api/puzzles/'):
            u = self.need(admin=True)
            if not u:
                return
            code = urllib.parse.unquote(path.rsplit('/', 1)[1])
            with db() as c:
                c.execute('DELETE FROM admin_puzzles WHERE code=?', (code,))
            reload_puzzles()
            self.audit('admin','puzzle','puzzle_deleted','ok',{'code':code},user=u)
            return self.send_json({'ok': True})
        return self.err('接口不存在', 404)


if __name__ == '__main__':
    init_db()
    BUILTIN_PUZZLES = load_builtin_puzzles()
    reload_puzzles()
    print(f'[数独小游戏 V3.2.8] http://127.0.0.1:{PORT}  puzzles={len(PUZZLES)}  db={DB_PATH}')
    ThreadingHTTPServer((HOST, PORT), H).serve_forever()
