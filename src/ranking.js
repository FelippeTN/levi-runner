// Login com conta local (via server.py; o 1º acesso cria a conta) e ranking no canto da tela.

import { api, setToken } from "./api.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const loginBox = document.getElementById("login");
const rankBox = document.getElementById("ranking");

export async function refreshRanking() {
  let r;
  try {
    r = await api("/api/ranking");
  } catch {
    return; // sem server.py (ex.: só o front no ar): joga sem ranking
  }
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

/** @param {() => void} onLogin carrega a conta e devolve o foco ao jogo */
export function initRanking(onLogin) {
  loginBox.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, erro = document.getElementById("login-erro");
    f.querySelector("button").disabled = true;
    erro.textContent = "";
    try {
      setToken((await api("/api/login", { usuario: f.usuario.value, senha: f.senha.value })).token);
      f.reset();
      loginBox.hidden = true;
      await refreshRanking();
      onLogin();
    } catch (err) {
      erro.textContent = err.message || "Falha no login";
    } finally {
      f.querySelector("button").disabled = false;
    }
  });
  refreshRanking();
}
