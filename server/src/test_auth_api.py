#!/usr/bin/env python3
"""测试 auth API 所有端点"""
import urllib.request, json, sys

BASE = "http://localhost:9091"

def post(path, body, token=None):
    data = json.dumps(body).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers={"Content-Type": "application/json"})
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def get(path, token=None):
    req = urllib.request.Request(f"{BASE}{path}")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

print("=== 1. health ===")
print(get("/api/v1/health"))

print("=== 2. 注册 test2 ===")
r = post("/api/v1/auth/register", {"username": "test2", "password": "123456", "nickname": "测试2号"})
print(r)
token = r["data"]["token"]

print("=== 3. 登录 ===")
r = post("/api/v1/auth/login", {"username": "test2", "password": "123456"})
print(r)

print("=== 4. /me (需认证) ===")
print(get("/api/v1/me", token))

print("=== 5. 更新资料 ===")
print(post("/api/v1/users/me", {"nickname": "新昵称", "phone": "13900139000"}, token))

print("=== 6. 修改密码 ===")
print(post("/api/v1/auth/change-password", {"old_password": "123456", "new_password": "abcdef"}, token))

print("=== 7. 旧密码登录（应失败）===")
try:
    print(post("/api/v1/auth/login", {"username": "test2", "password": "123456"}))
except Exception as e:
    print("预期失败:", e)

print("=== 8. 新密码登录（应成功）===")
print(post("/api/v1/auth/login", {"username": "test2", "password": "abcdef"}))
print("✅ 全部通过")