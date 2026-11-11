"""Regras do Banco do Levi no servidor. Uso: python3 -m unittest discover -s test"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["LEVI_DB"] = ":memory:"  # antes do import: não toca no ranking.db de verdade

import server  # noqa: E402

B = server.BANCO
TX = {"cofrinho": 0.01, "investimento": 0.03}
MES = B["metrosParaMes"]


def conta(**kw):
    return {"conta": 0, "cofrinho": 0, "aplicacoes": [], "mes": 0, "skins": ["classico"], "pintura": "classico", "acessorio": None, **kw}


class Banco(unittest.TestCase):
    def test_corrida_deposita_e_rende_uma_vez(self):
        acc = conta(cofrinho=100_000)
        r = server.fim_de_corrida(acc, MES, 5_000, TX)
        self.assertEqual(acc["conta"], 5_000)
        self.assertEqual(r["cofrinho"], round(100_000 * TX["cofrinho"]))
        self.assertEqual(acc["cofrinho"], 100_000 + r["cofrinho"])
        self.assertEqual(acc["mes"], 1)

    def test_corrida_curta_nao_rende(self):
        acc = conta(cofrinho=100_000)
        r = server.fim_de_corrida(acc, MES - 1, 5_000, TX)
        self.assertFalse(r["mes"])
        self.assertEqual((acc["cofrinho"], acc["mes"], acc["conta"]), (100_000, 0, 5_000))

    def test_deposito_tem_teto_pela_distancia(self):
        acc = conta()
        server.fim_de_corrida(acc, 10, 10**12, TX)
        self.assertEqual(acc["conta"], 10 * B["tetoPorMetro"])
        server.fim_de_corrida(acc, -5, -100, TX)
        self.assertEqual(acc["conta"], 10 * B["tetoPorMetro"])

    def test_investimento_fica_travado_ate_o_prazo(self):
        acc = conta(conta=100_000)
        server.movimentar(acc, "investir", 100_000)
        self.assertEqual(acc["conta"], 0)
        for _ in range(B["carencia"] - 1):
            server.fim_de_corrida(acc, MES, 0, TX)
            self.assertEqual(acc["conta"], 0)
        r = server.fim_de_corrida(acc, MES, 0, TX)
        esperado = 100_000
        for _ in range(B["carencia"]):
            esperado += server.render(esperado, TX["investimento"])
        self.assertEqual(r["liberado"], esperado)
        self.assertEqual((acc["conta"], acc["aplicacoes"]), (esperado, []))
        self.assertIsInstance(acc["conta"], int)

    def test_sem_saldo_e_valor_invalido_recusados(self):
        acc = conta(conta=500)
        for acao, valor in [("guardar", 501), ("sacar", 1), ("investir", 0), ("guardar", -5), ("guardar", "x"), ("roubar", 1)]:
            with self.assertRaises(server.Recusado):
                server.movimentar(acc, acao, valor)
        self.assertEqual(acc, conta(conta=500))
        server.movimentar(acc, "guardar", 200)
        server.movimentar(acc, "sacar", 50)
        self.assertEqual((acc["conta"], acc["cofrinho"]), (350, 150))

    def test_loja(self):
        preco = server.SKINS["oculos"]["preco"]
        acc = conta(conta=preco - 1)
        with self.assertRaises(server.Recusado):
            server.comprar(acc, "oculos")
        with self.assertRaises(server.Recusado):
            server.vestir(acc, "oculos")
        acc["conta"] = preco
        server.comprar(acc, "oculos")
        self.assertEqual((acc["conta"], acc["acessorio"]), (0, "oculos"))
        with self.assertRaises(server.Recusado):
            server.comprar(acc, "oculos")
        with self.assertRaises(server.Recusado):
            server.comprar(acc, "nao_existe")
        server.vestir(acc, None)
        self.assertIsNone(acc["acessorio"])

    def test_carregar_e_salvar(self):
        acc = server.carregar("teste")
        acc["conta"] = 123
        acc["aplicacoes"].append({"valor": 1, "libera_em": 6})
        server.salvar("teste", acc)
        self.assertEqual(server.carregar("teste"), acc)

    def test_taxas_seguem_a_selic_e_caem_para_a_reserva(self):
        def falha(serie):
            raise OSError("sem rede")

        server.atualizar_taxas(falha)
        t = server.taxas()
        self.assertEqual((t["selic"], t["ao_vivo"], t["consultado"]), (B["selicReserva"], False, B["reservaData"]))
        # 12 meses compostos da taxa mensal devolvem a taxa do ano
        self.assertAlmostEqual((1 + server.mensal(13.75)) ** 12, 1.1375)

        server.atualizar_taxas(lambda serie: {432: 10.0, 13522: 4.0}[serie])
        t = server.taxas()
        self.assertEqual((t["selic"], t["ipca"], t["ao_vivo"]), (10.0, 4.0, True))
        self.assertAlmostEqual(t["cofrinho"], server.mensal(10) * B["pctSelicCofrinho"])
        self.assertAlmostEqual(t["investimento"], server.mensal(10) * B["pctSelicInvestimento"])

        # resposta estranha do Banco Central não apaga o último valor bom
        for ruim in (lambda s: 500.0, lambda s: float("x"), lambda s: [][0]):
            server.atualizar_taxas(ruim)
        self.assertEqual(server.taxas()["selic"], 10.0)


if __name__ == "__main__":
    unittest.main()
