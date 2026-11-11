// Cliente da API do server.py (login, ranking, Banco do Levi).

const TOKEN = "levi-token";

export const loggedIn = () => !!localStorage.getItem(TOKEN);
export const setToken = (token) => localStorage.setItem(TOKEN, token);

/** POST com `body`, GET sem; erro da API vira exceção com a mensagem do servidor. */
export async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (localStorage.getItem(TOKEN) || "") },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.erro || "Servidor indisponível"), { status: res.status });
  return data;
}
