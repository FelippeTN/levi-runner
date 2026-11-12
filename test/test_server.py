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
    return {"conta": 0, "cofrinho": 0, "aplicacoes": [], "mes": 0, "skins": ["classico"], "pintura": "classico", "acessorio": None, "rendimentos": 0, **kw}


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

    def test_loja_usa_o_cofrinho_so_se_pedir(self):
        preco = server.SKINS["oculos"]["preco"]
        acc = conta(conta=preco - 300, cofrinho=500)
        with self.assertRaises(server.Recusado):
            server.comprar(acc, "oculos")
        with self.assertRaises(server.Recusado):
            server.comprar(conta(conta=preco - 300, cofrinho=299), "oculos", cofrinho=True)
        server.comprar(acc, "oculos", cofrinho=True)
        self.assertEqual((acc["conta"], acc["cofrinho"]), (0, 200))
        self.assertIn("oculos", acc["skins"])

    def test_clube_soma_os_juros_e_libera_as_exclusivas(self):
        acc = conta(cofrinho=100_000)
        aplicacao = server.nova_aplicacao(acc, "pos", 50_000, TX)
        acc["aplicacoes"].append(aplicacao)
        r = server.fim_de_corrida(acc, MES, 5_000, TX)
        # só juros contam: o depósito da corrida não
        self.assertEqual(acc["rendimentos"], r["cofrinho"] + r["investimento"])
        server.fim_de_corrida(acc, MES - 1, 5_000, TX)
        self.assertEqual(acc["rendimentos"], r["cofrinho"] + r["investimento"])

        exclusiva = next(s for s in server.CATALOG["skins"] if s.get("nivel"))
        minimo = next(n["rendimentos"] for n in server.CLUBE if n["id"] == exclusiva["nivel"])
        acc = conta(conta=exclusiva["preco"], rendimentos=minimo - 1)
        with self.assertRaises(server.Recusado):
            server.comprar(acc, exclusiva["id"])
        acc["rendimentos"] = minimo
        server.comprar(acc, exclusiva["id"])
        self.assertIn(exclusiva["id"], acc["skins"])

    def test_nivel_do_clube(self):
        self.assertEqual(server.nivel(0)["id"], server.CLUBE[0]["id"])
        self.assertEqual(server.nivel(server.CLUBE[1]["rendimentos"])["id"], server.CLUBE[1]["id"])
        self.assertEqual(server.nivel(10**12)["id"], server.CLUBE[-1]["id"])

    def test_carregar_e_salvar(self):
        acc = server.carregar("teste")
        acc["conta"] = 123
        acc["aplicacoes"].append({"id": 1, "tipo": "pre", "valor": 1, "aplicado": 1, "taxa": 0.01, "taxa_aa": 12.7, "libera_em": 6})
        server.salvar("teste", acc)
        self.assertEqual(server.carregar("teste"), acc)

    def test_taxas_seguem_a_selic_e_caem_para_a_reserva(self):
        def falha():
            raise OSError("sem rede")

        server.atualizar_taxas({nome: falha for nome in server.FONTES})
        t = server.taxas()
        self.assertEqual((t["selic"], t["ao_vivo"], t["consultado"]), (B["selicReserva"], False, B["reservaData"]))
        self.assertEqual(t["selic_esperada"], B["selicEsperadaReserva"])
        # 12 meses compostos da taxa mensal devolvem a taxa do ano
        self.assertAlmostEqual((1 + server.mensal(13.75)) ** 12, 1.1375)
        self.assertAlmostEqual(server.anual(server.mensal(13.75)), 13.75)

        server.atualizar_taxas({"selic": lambda: 10.0, "ipca": lambda: 4.0, "selic_esperada": lambda: 9.0})
        t = server.taxas()
        self.assertEqual((t["selic"], t["ipca"], t["selic_esperada"], t["ao_vivo"]), (10.0, 4.0, 9.0, True))
        self.assertAlmostEqual(t["cofrinho"], server.mensal(10) * B["pctSelicCofrinho"])
        self.assertAlmostEqual(t["investimento"], server.mensal(10) * B["pctSelicInvestimento"])
        # o pré embute a Selic esperada (9%), não a de hoje (10%)
        self.assertAlmostEqual(t["prefixado_aa"], server.anual(server.mensal(9) * B["pctSelicInvestimento"]) + B["premioPrefixado"])
        self.assertAlmostEqual(t["prefixado"], server.mensal(t["prefixado_aa"]))
        self.assertAlmostEqual(t["ipca_mensal"], server.mensal(4))

        # resposta estranha do Banco Central não apaga o último valor bom
        for ruim in (lambda: 500.0, lambda: float("x"), lambda: [][0]):
            server.atualizar_taxas({"selic": ruim})
        self.assertEqual(server.taxas()["selic"], 10.0)

    def test_focus_usa_a_pesquisa_mais_recente_e_as_proximas_reunioes(self):
        linha = lambda data, reuniao, mediana: {"Data": data, "Reuniao": reuniao, "Mediana": mediana}
        linhas = [
            linha("2026-11-06", "R2/2027", 12.0),
            linha("2026-11-06", "R8/2026", 14.0),
            linha("2026-11-06", "R1/2027", 13.0),
            linha("2026-11-06", "R3/2027", 1.0),   # fora das 3 próximas
            linha("2026-10-30", "R8/2026", 99.0),  # pesquisa antiga
        ]
        self.assertAlmostEqual(server.selic_esperada(linhas, reunioes=3), 13.0)


TXI = {**TX, "prefixado": 0.02, "prefixado_aa": server.anual(0.02), "ipca_mensal": 0.004, "ipca_real": 0.005, "ipca_real_aa": 6.17}


class Investimentos(unittest.TestCase):
    def test_prefixado_rende_a_taxa_travada_mesmo_se_a_selic_mudar(self):
        acc = conta(conta=100_000)
        server.movimentar(acc, "investir", 100_000, "pre", tx=TXI)
        ap = acc["aplicacoes"][0]
        self.assertEqual((ap["tipo"], ap["taxa"], ap["libera_em"]), ("pre", 0.02, B["prazoPrefixado"]))
        server.fim_de_corrida(acc, MES, 0, TXI)
        server.fim_de_corrida(acc, MES, 0, {**TXI, "investimento": 0.5, "prefixado": 0.5})  # juros dispararam
        esperado = 100_000
        for _ in range(2):
            esperado += server.render(esperado, 0.02)
        self.assertEqual(ap["valor"], esperado)

    def test_ipca_mais_soma_inflacao_do_mes_e_juro_real_travado(self):
        acc = conta(conta=100_000)
        server.movimentar(acc, "investir", 100_000, "ipca", tx=TXI)
        server.fim_de_corrida(acc, MES, 0, {**TXI, "ipca_mensal": 0.01, "ipca_real": 0.9})
        self.assertEqual(acc["aplicacoes"][0]["valor"], 100_000 + server.render(100_000, 1.01 * 1.005 - 1))
        self.assertEqual(acc["aplicacoes"][0]["libera_em"], B["prazoIpca"])

    def test_pos_fixado_e_o_padrao_e_aplicacao_antiga_vira_pos(self):
        acc = conta(conta=100_000)
        server.movimentar(acc, "investir", 50_000, tx=TXI)
        self.assertEqual(acc["aplicacoes"][0]["tipo"], "pos")
        with self.assertRaises(server.Recusado):
            server.movimentar(acc, "investir", 1, "acoes", tx=TXI)

        acc = server.carregar("antiga")
        acc["aplicacoes"] = [{"valor": 7, "libera_em": 6}, {"valor": 8, "libera_em": 6}]
        server.salvar("antiga", acc)
        lido = server.carregar("antiga")["aplicacoes"]
        self.assertEqual([(a["tipo"], a["id"], a["aplicado"]) for a in lido], [("pos", 1, 7), ("pos", 2, 8)])

    def test_resgate_antecipado_a_preco_de_mercado(self):
        def aplicado(tipo):
            acc = conta(conta=100_000)
            server.movimentar(acc, "investir", 100_000, tipo, tx=TXI)
            server.fim_de_corrida(acc, MES, 0, TXI)
            return acc

        # taxa de hoje igual à contratada: sai pela curva
        acc = aplicado("pre")
        curva = acc["aplicacoes"][0]["valor"]
        r = server.movimentar(acc, "resgatar", id=1, tx=TXI)
        self.assertEqual((r["resgate"], r["na_curva"], acc["conta"], acc["aplicacoes"]), (curva, curva, curva, []))

        # juros subiram depois da aplicação: vender antes do vencimento dá prejuízo
        acc = aplicado("pre")
        r = server.movimentar(acc, "resgatar", id=1, tx={**TXI, "prefixado": 0.03})
        faltam = B["prazoPrefixado"] - 1
        self.assertEqual(r["resgate"], round(r["na_curva"] * (1.02 / 1.03) ** faltam))
        self.assertLess(r["resgate"], r["na_curva"])

        # juros caíram: o título travado numa taxa maior vale mais
        acc = aplicado("ipca")
        r = server.movimentar(acc, "resgatar", id=1, tx={**TXI, "ipca_real": 0.003})
        self.assertGreater(r["resgate"], r["na_curva"])

    def test_resgate_recusado_no_pos_e_em_aplicacao_que_nao_existe(self):
        acc = conta(conta=100_000)
        server.movimentar(acc, "investir", 100_000, "pos", tx=TXI)
        for id in (1, 2, None, "x"):
            with self.assertRaises(server.Recusado):
                server.movimentar(acc, "resgatar", id=id, tx=TXI)
        self.assertEqual(len(acc["aplicacoes"]), 1)

    def test_vencimento_entra_no_resumo(self):
        acc = conta(conta=100_000)
        server.movimentar(acc, "investir", 100_000, "pos", tx=TXI)
        for _ in range(B["carencia"]):
            r = server.fim_de_corrida(acc, MES, 0, TXI)
        self.assertEqual([a["tipo"] for a in r["vencidos"]], ["pos"])


if __name__ == "__main__":
    unittest.main()
