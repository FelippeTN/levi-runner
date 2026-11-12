"""Serve o dist/ e a API de login (contas locais), ranking e Banco do Levi (conta, cofrinho, investimentos, loja).

Primeiro acesso com um usuário novo cria a conta; depois, a mesma senha é exigida.
O dinheiro mora aqui: o jogo só mostra. Regras e preços vêm de src/edu/catalog.json (o mesmo que o jogo lê).
Valores em centavos inteiros. Cada corrida de pelo menos `metrosParaMes` conta como um mês de rendimento,
à taxa Selic do Banco Central (buscada a cada 24 h; sem rede vale a última gravada ou a reserva do catálogo).
Investimentos: pós-fixado (Selic do mês), prefixado (taxa travada pela expectativa do Boletim Focus) e IPCA+.
Clube do Investidor: os juros recebidos somam em `rendimentos`, que dá o nível; skins exclusivas pedem um nível.
Uso: python3 server.py [porta]   (padrão 8042; só biblioteca padrão; LEVI_DB troca o arquivo do banco)
"""

import hashlib
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))

# no repositório fica em src/edu; no dist/ o build.sh deixa uma cópia
CATALOG_PATH = next(p for p in (os.path.join(ROOT, "src", "edu", "catalog.json"), os.path.join(ROOT, "dist", "catalog.json"))
                    if os.path.isfile(p))
with open(CATALOG_PATH, encoding="utf-8") as f:
    CATALOG = json.load(f)
BANCO = CATALOG["banco"]
SKINS = {s["id"]: s for s in CATALOG["skins"]}
CLUBE = CATALOG["clube"]

db = sqlite3.connect(os.environ.get("LEVI_DB", os.path.join(ROOT, "ranking.db")), check_same_thread=False, isolation_level=None)
db.executescript("""
    create table if not exists players (login text primary key, name text not null, best integer not null default 0);
    create table if not exists sessions (token text primary key, login text not null);
    create table if not exists contas (
        login text primary key,
        conta integer not null default 0,
        cofrinho integer not null default 0,
        aplicacoes text not null default '[]',
        mes integer not null default 0,
        skins text not null default '["classico"]',
        pintura text not null default 'classico',
        acessorio text,
        rendimentos integer not null default 0
    );
    create table if not exists taxas (serie text primary key, valor real not null, buscado_em integer not null);
""")
if "pw" not in [c[1] for c in db.execute("pragma table_info(players)")]:
    db.execute("alter table players add column pw text")  # bancos da versão com LDAP
if "rendimentos" not in [c[1] for c in db.execute("pragma table_info(contas)")]:
    db.execute("alter table contas add column rendimentos integer not null default 0")  # bancos de antes do clube
# reentrante: uma operação no dinheiro segura a trava do ler-mudar-gravar inteiro, e sql() pega de novo
db_lock = threading.RLock()


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


# ---------- Taxas do Banco Central: Selic meta e IPCA de 12 meses (SGS), Selic esperada (Boletim Focus) ----------

SERIES = {"selic": 432, "ipca": 13522}
FOCUS = ("https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoSelic"
         "?$top=40&$orderby=Data%20desc&$filter=baseCalculo%20eq%200&$format=json")
# o Copom se reúne a cada ~45 dias: o prazo do prefixado (em meses) cobre esse tanto de reuniões
REUNIOES_NO_PRAZO = max(1, round(BANCO["prazoPrefixado"] / 1.5))


def baixar(serie):
    # a API às vezes responde 304 sem corpo para `ultimos/1` (visto na série da Selic); pedir mais registros contorna
    for n in (1, 2, 3):
        try:
            with urllib.request.urlopen(f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados/ultimos/{n}?formato=json", timeout=5) as r:
                return float(json.load(r)[-1]["valor"])
        except urllib.error.HTTPError as e:
            erro = e
    raise erro


def selic_esperada(linhas, reunioes=REUNIOES_NO_PRAZO):
    """Média das medianas do Focus para as próximas `reunioes` do Copom, só da pesquisa mais recente."""
    ultima = max(l["Data"] for l in linhas)
    def ordem(l):
        n, ano = l["Reuniao"].removeprefix("R").split("/")
        return int(ano), int(n)
    proximas = sorted((l for l in linhas if l["Data"] == ultima), key=ordem)[:reunioes]
    return sum(float(l["Mediana"]) for l in proximas) / len(proximas)


def baixar_focus():
    with urllib.request.urlopen(FOCUS, timeout=10) as r:
        return selic_esperada(json.load(r)["value"])


FONTES = {**{nome: partial(baixar, serie) for nome, serie in SERIES.items()}, "selic_esperada": baixar_focus}


def atualizar_taxas(fontes=FONTES):
    """Grava o valor de hoje de cada fonte; sem rede ou com resposta estranha, fica o último gravado."""
    for nome, buscar in fontes.items():
        try:
            valor = buscar()
            if not 0 <= valor < 100:
                raise ValueError(valor)
            sql("insert into taxas values (?, ?, ?) on conflict(serie) do update set valor = excluded.valor, buscado_em = excluded.buscado_em",
                nome, valor, int(time.time()))
        except (OSError, ValueError, KeyError, IndexError, TypeError, ZeroDivisionError) as e:
            print(f"Banco Central indisponível ({nome}): {e!r}", file=sys.stderr)


def manter_taxas():
    """Consulta o Banco Central uma vez a cada 24 h, contadas da última consulta gravada (reiniciar o servidor não consulta de novo)."""
    dia = 24 * 3600
    while True:
        n, ultima = sql("select count(*), min(buscado_em) from taxas")[0]
        espera = (ultima + dia - time.time()) if n == len(FONTES) else 0
        if espera <= 0:
            atualizar_taxas()
            espera = dia
        time.sleep(espera)


def mensal(ao_ano):
    """Taxa % ao ano → fração ao mês equivalente (juros compostos)."""
    return (1 + ao_ano / 100) ** (1 / 12) - 1


def anual(ao_mes):
    """Fração ao mês → taxa % ao ano equivalente (o inverso de `mensal`)."""
    return ((1 + ao_mes) ** 12 - 1) * 100


def taxas():
    """Taxas em vigor: do Banco Central se já vieram alguma vez; senão a reserva do catálogo."""
    rows = {s: (v, t) for s, v, t in sql("select serie, valor, buscado_em from taxas")}
    data = lambda quando: time.strftime("%d/%m/%Y", time.localtime(quando)) if quando else BANCO["reservaData"]
    selic, quando = rows.get("selic", (BANCO["selicReserva"], None))
    ipca = rows.get("ipca", (BANCO["ipcaReserva"], None))[0]
    esperada, focus_em = rows.get("selic_esperada", (BANCO["selicEsperadaReserva"], None))
    m = mensal(selic)
    # prefixado: a mesma fatia da Selic que o pós paga, só que sobre a Selic que o mercado espera, mais um prêmio
    prefixado_aa = anual(mensal(esperada) * BANCO["pctSelicInvestimento"]) + BANCO["premioPrefixado"]
    return {
        "selic": selic,
        "ipca": ipca,
        "cofrinho": m * BANCO["pctSelicCofrinho"],
        "investimento": m * BANCO["pctSelicInvestimento"],
        "selic_esperada": esperada,
        "focus_consultado": data(focus_em),
        "prefixado_aa": prefixado_aa,
        "prefixado": mensal(prefixado_aa),
        "ipca_mensal": mensal(ipca),
        "ipca_real_aa": BANCO["jurosRealIpca"],
        "ipca_real": mensal(BANCO["jurosRealIpca"]),
        "consultado": data(quando),
        "ao_vivo": quando is not None,
    }


# ---------- Banco do Levi: regras puras sobre um dict (testadas em tests/test_server.py) ----------

class Recusado(Exception):
    """Operação que o banco não aceita; a mensagem vai para o jogador."""


def render(valor, taxa):
    return int(valor * taxa + 0.5)


# pós: carência sem resgate (como um CDB com carência); pré e IPCA+: vencimento com venda a preço de mercado
PRAZOS = {"pos": BANCO["carencia"], "pre": BANCO["prazoPrefixado"], "ipca": BANCO["prazoIpca"]}


def taxa_do_mes(ap, tx):
    """Rendimento de um mês: o pós segue a Selic de agora; o pré e o juro real do IPCA+ ficaram travados na aplicação."""
    tipo = ap.get("tipo", "pos")
    if tipo == "pre":
        return ap["taxa"]
    if tipo == "ipca":
        return (1 + tx["ipca_mensal"]) * (1 + ap["taxa"]) - 1
    return tx["investimento"]


def marcacao(valor, contratada, hoje, meses):
    """Preço de venda antes do vencimento: o que o título paga no fim, descontado pela taxa que o mercado pede hoje.
    No IPCA+ a inflação aparece dos dois lados e se cancela, então basta passar as taxas reais."""
    return int(valor * ((1 + contratada) / (1 + hoje)) ** max(0, meses) + 0.5)


def fim_de_corrida(acc, distancia, patrimonio, tx):
    """Deposita o que a corrida juntou e, se a corrida valeu um mês, aplica o rendimento de `tx` (ver `taxas`). Devolve o resumo."""
    distancia = max(0, min(int(distancia), 1_000_000))
    # ponytail: o patrimônio vem do cliente; o teto pela distância só limita o estrago de quem forjar
    deposito = max(0, min(int(patrimonio), distancia * BANCO["tetoPorMetro"]))
    acc["conta"] += deposito
    resumo = {"deposito": deposito, "mes": False, "cofrinho": 0, "investimento": 0, "liberado": 0, "vencidos": []}
    if distancia < BANCO["metrosParaMes"]:
        return resumo
    acc["mes"] += 1
    resumo["mes"] = True
    resumo["cofrinho"] = render(acc["cofrinho"], tx["cofrinho"])
    acc["cofrinho"] += resumo["cofrinho"]
    ativas = []
    for ap in acc["aplicacoes"]:
        r = render(ap["valor"], taxa_do_mes(ap, tx))
        ap["valor"] += r
        resumo["investimento"] += r
        if acc["mes"] >= ap["libera_em"]:
            acc["conta"] += ap["valor"]
            resumo["liberado"] += ap["valor"]
            resumo["vencidos"].append(ap)
        else:
            ativas.append(ap)
    acc["aplicacoes"] = ativas
    acc["rendimentos"] = acc.get("rendimentos", 0) + resumo["cofrinho"] + resumo["investimento"]
    return resumo


def nova_aplicacao(acc, tipo, valor, tx):
    ap = {"id": max((a.get("id", 0) for a in acc["aplicacoes"]), default=0) + 1, "tipo": tipo, "valor": valor, "aplicado": valor,
          "libera_em": acc["mes"] + PRAZOS[tipo]}
    if tipo == "pre":
        ap.update(taxa=tx["prefixado"], taxa_aa=tx["prefixado_aa"])
    elif tipo == "ipca":
        ap.update(taxa=tx["ipca_real"], taxa_aa=tx["ipca_real_aa"])
    return ap


def resgatar(acc, id, tx):
    ap = next((a for a in acc["aplicacoes"] if a["id"] == id), None)
    if ap is None:
        raise Recusado("Aplicação não encontrada")
    if ap.get("tipo", "pos") == "pos":
        raise Recusado("Pós-fixado com carência: só libera no vencimento")
    hoje = tx["prefixado"] if ap["tipo"] == "pre" else tx["ipca_real"]
    preco = marcacao(ap["valor"], ap["taxa"], hoje, ap["libera_em"] - acc["mes"])
    acc["aplicacoes"].remove(ap)
    acc["conta"] += preco
    return {"resgate": preco, "na_curva": ap["valor"], "tipo": ap["tipo"]}


def movimentar(acc, acao, valor=None, tipo=None, id=None, tx=None):
    """guardar (conta → cofrinho), sacar (cofrinho → conta), investir (conta → aplicação do `tipo`: pos, pre ou ipca)
    ou resgatar (aplicação `id` → conta, a preço de mercado). Devolve o resumo do resgate; as outras, None."""
    if acao == "resgatar":
        try:
            return resgatar(acc, int(id), tx or taxas())
        except (TypeError, ValueError):
            raise Recusado("Aplicação não encontrada")
    try:
        valor = int(valor)
    except (TypeError, ValueError):
        raise Recusado("Valor inválido")
    if valor <= 0:
        raise Recusado("Valor inválido")
    origem = "cofrinho" if acao == "sacar" else "conta"
    if acao not in ("guardar", "sacar", "investir"):
        raise Recusado("Operação desconhecida")
    tipo = tipo or "pos"
    if acao == "investir" and tipo not in PRAZOS:
        raise Recusado("Tipo de investimento desconhecido")
    if acc[origem] < valor:
        raise Recusado("Saldo insuficiente")
    acc[origem] -= valor
    if acao == "guardar":
        acc["cofrinho"] += valor
    elif acao == "sacar":
        acc["conta"] += valor
    else:
        acc["aplicacoes"].append(nova_aplicacao(acc, tipo, valor, tx or taxas()))


def nivel(rendimentos):
    """Nível do Clube do Investidor: o mais alto cujo mínimo de rendimentos já foi alcançado."""
    return [n for n in CLUBE if rendimentos >= n["rendimentos"]][-1]


def comprar(acc, skin_id, cofrinho=False):
    """Compra com o saldo da conta; com `cofrinho`, o que faltar sai do cofrinho na mesma operação."""
    skin = SKINS.get(skin_id)
    if not skin:
        raise Recusado("Skin desconhecida")
    if skin_id in acc["skins"]:
        raise Recusado("Você já tem essa skin")
    exige = next((n for n in CLUBE if n["id"] == skin.get("nivel")), None)
    if exige and acc.get("rendimentos", 0) < exige["rendimentos"]:
        raise Recusado(f"Exclusiva do Clube do Investidor: chegue ao nível {exige['nome']}")
    falta = max(0, skin["preco"] - acc["conta"])
    if falta > (acc["cofrinho"] if cofrinho else 0):
        raise Recusado("Saldo na conta insuficiente")
    acc["cofrinho"] -= falta
    acc["conta"] += falta - skin["preco"]
    acc["skins"].append(skin_id)
    vestir(acc, skin_id)


def vestir(acc, skin_id):
    """Veste uma skin comprada; acessório `None` tira o acessório."""
    if skin_id is None:
        acc["acessorio"] = None
        return
    if skin_id not in acc["skins"] or skin_id not in SKINS:
        raise Recusado("Skin não comprada")
    acc["pintura" if SKINS[skin_id]["tipo"] == "pintura" else "acessorio"] = skin_id


COLS = ("conta", "cofrinho", "aplicacoes", "mes", "skins", "pintura", "acessorio", "rendimentos")


def carregar(login):
    sql("insert or ignore into contas (login) values (?)", login)
    row = sql(f"select {', '.join(COLS)} from contas where login = ?", login)[0]
    acc = dict(zip(COLS, row))
    acc["aplicacoes"], acc["skins"] = json.loads(acc["aplicacoes"]), json.loads(acc["skins"])
    # aplicações de antes dos tipos: eram todas pós-fixadas e não tinham id
    proximo = max((a.get("id", 0) for a in acc["aplicacoes"]), default=0)
    for ap in acc["aplicacoes"]:
        ap.setdefault("tipo", "pos")
        ap.setdefault("aplicado", ap["valor"])
        if "id" not in ap:
            proximo += 1
            ap["id"] = proximo
    return acc


def salvar(login, acc):
    vals = [json.dumps(acc[c]) if c in ("aplicacoes", "skins") else acc[c] for c in COLS]
    sql(f"update contas set {', '.join(c + ' = ?' for c in COLS)} where login = ?", *vals, login)


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
        if self.path == "/api/conta":
            login = self.login_from_token()
            if not login:
                return self.send_json({"erro": "Faça login"}, 401)
            with db_lock:
                return self.send_json({**carregar(login), "taxas": taxas()})
        if self.path == "/api/taxas":
            return self.send_json(taxas())
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
            if not isinstance(body, dict):
                raise ValueError
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

        login = self.login_from_token()
        if not login:
            return self.send_json({"erro": "Faça login"}, 401)
        try:
            with db_lock:
                acc = carregar(login)
                resumo = None
                if self.path == "/api/corrida":
                    # ponytail: a pontuação vem do cliente e dá para forjar; validar no servidor se virar competição séria
                    score = max(0, min(int(body.get("pontos", 0)), 10_000_000))
                    sql("update players set best = max(best, ?) where login = ?", score, login)
                    resumo = fim_de_corrida(acc, body.get("distancia", 0), body.get("patrimonio", 0), taxas())
                elif self.path == "/api/banco":
                    resumo = movimentar(acc, body.get("acao"), body.get("valor"), body.get("tipo"), body.get("id"))
                elif self.path == "/api/loja":
                    comprar(acc, body.get("skin"), body.get("cofrinho") is True)
                elif self.path == "/api/vestir":
                    vestir(acc, body.get("skin"))
                else:
                    return self.send_json({"erro": "Não encontrado"}, 404)
                salvar(login, acc)
        except (TypeError, ValueError):
            return self.send_json({"erro": "Dados inválidos"}, 400)
        except Recusado as e:
            return self.send_json({"erro": str(e)}, 400)
        self.send_json({**acc, "resumo": resumo, "taxas": taxas()})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8042
    threading.Thread(target=manter_taxas, daemon=True).start()
    print(f"Levi Runner em http://0.0.0.0:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), partial(Handler, directory=os.path.join(ROOT, "dist"))).serve_forever()
