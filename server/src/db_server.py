#!/usr/bin/env python3
"""
ZBB 用户注册服务（SQLite 本地数据库）
http://localhost:9091/api/v1/
"""

import sqlite3
import hashlib
import secrets
import time
import json
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

DB_PATH = "/mnt/d/projects/project_coze0520/server/data/zbb.db"

# ─── 数据库初始化 ────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            username    TEXT    UNIQUE NOT NULL,
            password    TEXT    NOT NULL,
            nickname    TEXT,
            phone       TEXT,
            avatar      TEXT,
            role        TEXT    DEFAULT 'user',
            status      TEXT    DEFAULT 'active',
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS auth_tokens (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            token       TEXT    UNIQUE NOT NULL,
            expires_at  INTEGER NOT NULL,
            created_at  INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS login_history (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id   INTEGER NOT NULL,
            ip        TEXT,
            ua        TEXT,
            login_at  INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()

def make_token(user_id: int, expire_days: int = 30) -> str:
    raw = f"{user_id}:{secrets.token_hex(16)}:{time.time()}"
    token = hashlib.sha256(raw.encode()).hexdigest()
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO auth_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)",
        (user_id, token, int(time.time()) + expire_days * 86400, int(time.time()))
    )
    conn.commit()
    conn.close()
    return token

def verify_token(token: str) -> dict | None:
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT u.id, u.username, u.nickname, u.phone, u.avatar, u.role, u.status "
        "FROM auth_tokens t JOIN users u ON u.id = t.user_id "
        "WHERE t.token = ? AND t.expires_at > ?",
        (token, int(time.time()))
    )
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None

# ─── 密码工具 ────────────────────────────────────────────────

def hash_pwd(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

# ─── 请求体解析 ──────────────────────────────────────────────

def json_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length") or 0)
    body = handler.rfile.read(length) if length else b""
    return json.loads(body.decode()) if body else {}

def require_json(handler: BaseHTTPRequestHandler) -> dict | None:
    if handler.headers.get("Content-Type", "").startswith("application/json"):
        return json_body(handler)
    handler.send_error(400, "Content-Type must be application/json")
    return None

# ─── REST 路由 ───────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):

    def _send_json(self, status: int, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _ok(self, data):
        self._send_json(200, {"code": 0, "data": data})

    def _error(self, status: int, msg: str, code: int = 1):
        self._send_json(status, {"code": code, "message": msg})

    def _require_auth(self):
        token = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not token:
            self._error(401, "未提供 token")
            return None
        user = verify_token(token)
        if not user:
            self._error(401, "token 无效或已过期")
            return None
        return user

    # GET /api/v1/health
    def do_GET(self):
        parsed = urlparse(self.path)
        path  = parsed.path.rstrip("/")
        query = parse_qs(parsed.query)

        # 健康检查
        if path == "/api/v1/health":
            return self._ok({"status": "ok", "timestamp": int(time.time())})

        # 验证 token
        if path == "/api/v1/me":
            user = self._require_auth()
            return self._ok(user) if user else None

        self._error(404, "未找到")

    # POST /api/v1/auth/register
    def do_POST(self):
        parsed = urlparse(self.path)
        path  = parsed.path.rstrip("/")
        body  = require_json(self)
        if body is None:
            return

        # 注册
        if path == "/api/v1/auth/register":
            username = (body.get("username") or "").strip()
            password = body.get("password") or ""
            nickname = (body.get("nickname") or "").strip()
            phone    = (body.get("phone") or "").strip()

            if not username or len(username) < 2:
                return self._error(400, "用户名至少2个字符")
            if not password or len(password) < 6:
                return self._error(400, "密码至少6个字符")
            if phone and not re.match(r"^1[3-9]\d{9}$", phone):
                return self._error(400, "手机号格式不正确")

            try:
                conn   = get_db()
                cur    = conn.cursor()
                cur.execute(
                    "INSERT INTO users (username, password, nickname, phone, role, status, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, 'user', 'active', ?, ?)",
                    (username, hash_pwd(password), nickname or username, phone,
                     int(time.time()), int(time.time()))
                )
                user_id = cur.lastrowid
                conn.commit()
                conn.close()
            except sqlite3.IntegrityError:
                return self._error(409, "用户名已存在")
            token = make_token(user_id)
            return self._ok({"token": token, "user_id": user_id})

        # 登录
        if path == "/api/v1/auth/login":
            username = (body.get("username") or "").strip()
            password = body.get("password") or ""

            conn = get_db()
            cur  = conn.cursor()
            cur.execute("SELECT * FROM users WHERE username = ? AND password = ?",
                       (username, hash_pwd(password)))
            row = cur.fetchone()
            conn.close()
            if not row:
                return self._error(401, "用户名或密码错误")

            user_id  = row["id"]
            ip       = self.client_address[0]
            ua       = self.headers.get("User-Agent", "")
            token    = make_token(user_id)

            # 记录登录历史
            conn2 = get_db()
            cur2  = conn2.cursor()
            cur2.execute(
                "INSERT INTO login_history (user_id, ip, ua, login_at) VALUES (?, ?, ?, ?)",
                (user_id, ip, ua, int(time.time()))
            )
            conn2.commit()
            conn2.close()

            return self._ok({
                "token": token,
                "user": {
                    "id":       row["id"],
                    "username": row["username"],
                    "nickname": row["nickname"],
                    "phone":    row["phone"],
                    "role":     row["role"],
                }
            })

        # 修改密码（已登录）
        if path == "/api/v1/auth/change-password":
            user = self._require_auth()
            if not user:
                return
            old_pwd = body.get("old_password") or ""
            new_pwd = body.get("new_password") or ""
            if not new_pwd or len(new_pwd) < 6:
                return self._error(400, "新密码至少6个字符")

            conn = get_db()
            cur  = conn.cursor()
            cur.execute("SELECT id FROM users WHERE id = ? AND password = ?",
                       (user["id"], hash_pwd(old_pwd)))
            if not cur.fetchone():
                conn.close()
                return self._error(400, "原密码错误")

            cur.execute("UPDATE users SET password = ?, updated_at = ? WHERE id = ?",
                       (hash_pwd(new_pwd), int(time.time()), user["id"]))
            conn.commit()
            conn.close()
            return self._ok({"message": "密码已更新"})

        # 更新个人资料（已登录）
        if path == "/api/v1/users/me":
            user = self._require_auth()
            if not user:
                return
            nickname = (body.get("nickname") or "").strip()
            phone    = (body.get("phone") or "").strip()

            if phone and not re.match(r"^1[3-9]\d{9}$", phone):
                return self._error(400, "手机号格式不正确")

            conn = get_db()
            cur  = conn.cursor()
            cur.execute(
                "UPDATE users SET nickname = COALESCE(NULLIF(?, ''), nickname), "
                "phone = COALESCE(NULLIF(?, ''), phone), updated_at = ? WHERE id = ?",
                (nickname, phone, int(time.time()), user["id"])
            )
            conn.commit()
            cur.execute("SELECT * FROM users WHERE id = ?", (user["id"],))
            row = dict(cur.fetchone())
            conn.close()
            return self._ok(row)

        self._error(404, "未找到")

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {args[0]}")


# ─── 启动 ────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    os.makedirs("/mnt/d/projects/project_coze0520/server/data", exist_ok=True)
    init_db()
    server = HTTPServer(("0.0.0.0", 9091), Handler)
    print("用户注册服务已启动：http://0.0.0.0:9091/api/v1/")
    server.serve_forever()