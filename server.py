"""Serve o dist/ e a API de login (contas locais) + ranking.

Primeiro acesso com um usuário novo cria a conta; depois, a mesma senha é exigida.
Uso: python3 server.py [porta]   (padrão 8042; só biblioteca padrão)
"""

import hashlib
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))

db = sqlite3.connect(os.path.join(ROOT, "ranking.db"), check_same_thread=False, isolation_level=None)
db.executescript("""
    create table if not exists players (login text primary key, name text not null, best integer not null default 0);
    create table if not exists sessions (token text primary key, login text not null);
""")
if "pw" not in [c[1] for c in db.execute("pragma table_info(players)")]:
    db.execute("alter table players add column pw text")  # bancos da versão com LDAP
db_lock = threading.Lock()


def sql(query, *args):
    with db_lock:
        return db.execute(query, args).fetchall()


def hash_pw(password, salt=None):
    salt = salt or secrets.token_hex(16)
    return salt + "$" + hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000).hex()


def check_or_create(login, password):
    """True se a senha confere; cria a conta se o usuário ainda não existe (ou veio do LDAP, sem senha)."""
    rows = sql("select pw from players where login = ?", login)
    if not rows or not rows[0][0]:
        sql("insert into players (login, name, pw) values (?, ?, ?) on conflict(login) do update set pw = excluded.pw",
            login, login, hash_pw(password))
        return True
    stored = rows[0][0]
    return secrets.compare_digest(stored, hash_pw(password, stored.split("$")[0]))


class Handler(SimpleHTTPRequestHandler):
    gz = False

    def translate_path(self, path):
        """Entrega o `.gz` gerado pelo build.sh a quem aceita gzip."""
        real = super().translate_path(path)
        self.gz = "gzip" in self.headers.get("Accept-Encoding", "") and os.path.isfile(real + ".gz")
        return real + ".gz" if self.gz else real

    def guess_type(self, path):
        return super().guess_type(path[:-3] if self.gz else path)

    def end_headers(self):
        if self.gz:
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Vary", "Accept-Encoding")
        super().end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def login_from_token(self):
        token = self.headers.get("Authorization", "").removeprefix("Bearer ")
        rows = sql("select login from sessions where token = ?", token)
        return rows[0][0] if rows else None

    def do_GET(self):
        if self.path != "/api/ranking":
            return super().do_GET()
        top = sql("select name, best, login from players where best > 0 order by best desc limit 10")
        me = self.login_from_token()
        self.send_json({
            "top": [{"nome": n, "pontos": b, "eu": l == me} for n, b, l in top],
            "eu": me and dict(zip(("nome", "pontos"), sql("select name, best from players where login = ?", me)[0])),
        })

    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except ValueError:
            return self.send_json({"erro": "JSON inválido"}, 400)

        if self.path == "/api/login":
            login = str(body.get("usuario", "")).strip().lower()
            senha = str(body.get("senha", ""))
            if not re.fullmatch(r"[\w.-]{1,32}", login):
                return self.send_json({"erro": "Usuário: até 32 letras, números, ponto ou traço"}, 400)
            if len(senha) < 4:
                return self.send_json({"erro": "Senha: mínimo de 4 caracteres"}, 400)
            if not check_or_create(login, senha):
                return self.send_json({"erro": "Senha incorreta para esse usuário"}, 401)
            token = secrets.token_urlsafe(32)
            sql("insert into sessions values (?, ?)", token, login)
            return self.send_json({"token": token})

        if self.path == "/api/score":
            login = self.login_from_token()
            if not login:
                return self.send_json({"erro": "Faça login"}, 401)
            # ponytail: a pontuação vem do cliente e dá para forjar; validar no servidor se virar competição séria
            score = max(0, min(int(body.get("pontos", 0)), 10_000_000))
            sql("update players set best = max(best, ?) where login = ?", score, login)
            return self.send_json({"ok": True})

        self.send_json({"erro": "Não encontrado"}, 404)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8042
    print(f"Levi Runner em http://0.0.0.0:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), partial(Handler, directory=os.path.join(ROOT, "dist"))).serve_forever()
