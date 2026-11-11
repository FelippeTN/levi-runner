// Login com conta local (via server.py; o 1º acesso cria a conta) e ranking no canto da tela.

const TOKEN = "levi-token";

const api = (path, body) =>
  fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (localStorage.getItem(TOKEN) || "") },
    body: body && JSON.stringify(body),
  });

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const loginBox = document.getElementById("login");
const rankBox = document.getElementById("ranking");

async function refresh() {
  const res = await api("/api/ranking");
  if (!res.ok) return; // sem server.py (ex.: só o front no ar): joga sem ranking
  const r = await res.json();
  if (!r.eu) {
    loginBox.hidden = false;
    rankBox.hidden = true;
    return;
  }
  rankBox.querySelector("ol").innerHTML = r.top
    .map((p) => `<li class="${p.eu ? "eu" : ""}"><span>${esc(p.nome)}</span><span>${p.pontos}</span></li>`)
    .join("");
  rankBox.querySelector("p").textContent = `Você: ${r.eu.nome} — recorde ${r.eu.pontos}`;
  rankBox.hidden = false;
}

/** Envia a pontuação ao fim de cada corrida. */
export function submitScore(pontos) {
  return api("/api/score", { pontos }).then(refresh).catch(() => {});
}

/** @param {() => void} onLogin devolve o foco ao jogo */
export function initRanking(onLogin) {
  loginBox.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, erro = document.getElementById("login-erro");
    f.querySelector("button").disabled = true;
    erro.textContent = "";
    try {
      const res = await api("/api/login", { usuario: f.usuario.value, senha: f.senha.value });
      const r = await res.json();
      if (!res.ok) throw new Error(r.erro);
      localStorage.setItem(TOKEN, r.token);
      f.reset();
      loginBox.hidden = true;
      await refresh();
      onLogin();
    } catch (err) {
      erro.textContent = err.message || "Falha no login";
    } finally {
      f.querySelector("button").disabled = false;
    }
  });
  refresh().catch(() => {});
}
