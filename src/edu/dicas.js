// "Dica do Levi" no fim da corrida. Arquivo de conteúdo: a equipe do PGE Educa pode revisar e
// reescrever os textos sem mexer em mais nada. Números do mundo real só com fonte oficial.

import { aa, RATES } from "./bank.js";
import { brl } from "./economy.js";

/**
 * @typedef {{acc: import("../account.js").Account["data"], resumo: null | {vencidos?: {tipo: string, taxa_aa?: number}[]}}} Banco
 * a conta e o resumo da corrida vindos do servidor (só existe com login e depois que o servidor responde)
 */

const aplicacoes = (b) => b?.acc?.aplicacoes ?? [];
const venceu = (b, tipo) => b?.resumo?.vencidos?.find((a) => (a.tipo ?? "pos") === tipo);

/** Em ordem de prioridade: vale a primeira cujo `quando` combina com a corrida (`l`) e o banco (`b`, pode ser null). */
export const DICAS = [
  {
    quando: (l) => l.apostas > 0,
    texto: (l) =>
      `A aposta levou ${brl(l.apostas)} seu hoje. Em aposta, as regras são feitas para a casa lucrar no longo prazo: quem joga sempre, perde sempre.`,
  },
  {
    quando: (l) => l.jurosCartao >= 1,
    texto: (l) =>
      `Você comprou no cartão sem ter o dinheiro e pagou ${brl(l.jurosCartao)} só de juros. Juro de dívida corre mais rápido que o de qualquer investimento: primeiro junte, depois compre.`,
  },
  {
    quando: (l) => l.batidaSemReserva && !l.poupou,
    texto: () => "Você bateu sem reserva. Guardar um pouco de tudo que entra é o que impede um imprevisto de virar dívida.",
  },
  {
    quando: (l) => l.reservaUsada > 0,
    texto: (l) =>
      `Sua reserva te salvou ${l.reservaUsada}× hoje. Na vida real, reserva de emergência é o dinheiro guardado para o celular que quebra ou a conta que aparece do nada.`,
  },
  {
    quando: (l) => l.investiu,
    texto: (l) =>
      `Você ganhou ${brl(l.juros)} só de deixar o dinheiro investido. São juros sobre juros: quanto mais cedo começa, mais rende.`,
  },
  {
    quando: (l) => l.compras > 0,
    texto: () => "Comprar é bom quando cabe no bolso e foi planejado. Antes de gastar, pergunte: eu preciso ou só quero agora?",
  },
  // ---------- dicas do banco: dependem do que o jogador fez com os investimentos ----------
  {
    quando: (l, b) => venceu(b, "pre"),
    texto: (l, b) =>
      `Seu prefixado venceu e pagou exatamente o combinado: ${aa(venceu(b, "pre").taxa_aa)} ao ano, não importa o que a Selic fez no caminho. Essa é a previsibilidade do prefixado levado até o vencimento.`,
  },
  {
    quando: (l, b) => venceu(b, "ipca"),
    texto: (l, b) =>
      `Seu IPCA+ venceu: você recebeu a inflação do período mais ${aa(venceu(b, "ipca").taxa_aa)} ao ano. Seu dinheiro cresceu acima dos preços, e isso é ganho real de poder de compra.`,
  },
  {
    quando: (l, b) => venceu(b, "pos"),
    texto: () =>
      "Seu pós-fixado venceu. Ele acompanhou a Selic mês a mês: se os juros tivessem subido, você teria ganhado mais; se caíssem, menos. Você conhece a regra, não o valor final.",
  },
  {
    quando: (l, b) => aplicacoes(b).length > 0 && b.acc.cofrinho === 0,
    texto: () =>
      "Você tem dinheiro investido, mas o cofrinho está vazio. A ordem certa é: primeiro a reserva de emergência, num pós-fixado com liquidez diária que você saca sem perder nada; depois, investimentos com prazo.",
  },
  {
    quando: (l, b) => aplicacoes(b).some((a) => a.tipo === "pre" && RATES.prefixado > a.taxa * 1.001),
    texto: () =>
      "Os juros subiram depois que você travou seu prefixado. Se vender agora, sai abaixo do valor na curva; levando até o vencimento, você recebe exatamente o combinado. Por isso o prazo do prefixado deve casar com o do seu objetivo.",
  },
  {
    quando: (l, b) => aplicacoes(b).length >= 2 && new Set(aplicacoes(b).map((a) => a.tipo)).size === 1,
    texto: () =>
      "Todo o seu investimento está num tipo só. Ninguém sabe ao certo para onde a Selic vai: dividir entre pós-fixado, prefixado e IPCA+ protege você de errar a aposta.",
  },
  {
    quando: (l, b) => b?.acc?.cofrinho > 0 && aplicacoes(b).length === 0 && b.acc.conta > b.acc.cofrinho,
    texto: () =>
      "Sua reserva já está no cofrinho. Para um objetivo com data, como uma skin cara, escolha no banco um investimento com prazo parecido: ele costuma render mais que a reserva.",
  },
  {
    quando: (l) => l.poupou,
    texto: () =>
      "O que sobra da corrida vai para a sua conta, onde fica parado. No cofrinho do Banco do Levi ele rende a Selic, a taxa básica de juros do Brasil.",
  },
  {
    quando: () => true,
    texto: () => "Dinheiro parado na conta não rende. Entre uma corrida e outra, guarde no cofrinho do Banco do Levi.",
  },
];

/** @param {import("./economy.js").Wallet["ledger"]} ledger @param {Banco | null} [banco] */
export function pickTip(ledger, banco = null) {
  return DICAS.find((d) => d.quando(ledger, banco)).texto(ledger, banco);
}

// ---------- Textos do Banco do Levi ----------

export const SELIC_EXPLICA =
  "A Selic é a taxa básica de juros do Brasil. Quem decide é o Copom, um comitê do Banco Central que se reúne a cada 45 dias, mais ou menos. " +
  "Quando a Selic sobe, guardar dinheiro rende mais e pegar emprestado fica mais caro; quando cai, acontece o contrário. " +
  "Por isso o cofrinho daqui rende o que a Selic estiver pagando hoje.";

/** 13.75 → "13,75" */
export const aoAno = (taxa) => taxa.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

/** @param {number} de @param {number} para Selic em % ao ano @param {string} rende rendimento do cofrinho por corrida, já formatado */
export const selicMudou = (de, para, rende) =>
  `A Selic ${para > de ? "subiu" : "caiu"} de ${aoAno(de)}% para ${aoAno(para)}% ao ano. Seu cofrinho agora rende ${rende} por corrida.`;

/** @param {number} valor centavos @param {number} ipca % em 12 meses @param {number} meses */
export const inflacao = (valor, ipca, meses) =>
  `Em ${meses} corridas os preços sobem cerca de ${ipca.toLocaleString("pt-BR")}% (IPCA, a inflação oficial). ` +
  `${brl(valor)} parados na conta passam a comprar só o que ${brl(valor / (1 + ipca / 100))} compram hoje.`;

/** @param {{resgate: number, na_curva: number}} r centavos: o que entrou na conta e o valor na curva do título */
export function resgateTexto({ resgate, na_curva }) {
  const dif = resgate - na_curva;
  if (Math.abs(dif) < 100) return `Resgatado por ${brl(resgate)}: os juros não mudaram desde a aplicação, então o preço de mercado bateu com o valor na curva.`;
  return dif < 0
    ? `Resgatado por ${brl(resgate)}, ${brl(-dif)} abaixo da curva: os juros subiram e o título travado numa taxa menor perdeu valor. No vencimento, viria o combinado.`
    : `Resgatado por ${brl(resgate)}, ${brl(dif)} acima da curva: os juros caíram e o título travado numa taxa maior ganhou valor.`;
}

// ---------- Guia "Aprenda": prefixado, pós-fixado e IPCA+ ----------

export const GUIA_RENDA_FIXA = [
  {
    titulo: "Pós-fixado: acompanha os juros",
    texto:
      "A rentabilidade segue um indicador, como a Selic ou o CDI. Na aplicação você conhece a regra (por exemplo, 100% da Selic), mas não o valor final, que depende de como os juros andarem. " +
      "Se a Selic sobe, rende mais; se cai, rende menos. Como o preço quase não oscila, é a escolha natural para a reserva de emergência, desde que tenha liquidez diária, e para objetivos de curto prazo.",
  },
  {
    titulo: "Prefixado: a taxa é combinada no dia da aplicação",
    texto:
      "Você sabe, desde o primeiro dia, exatamente quanto vai receber no vencimento. Essa taxa não sai do nada: ela já embute o que o mercado espera para a Selic, expectativa que o Banco Central publica toda semana no Boletim Focus. " +
      "O prefixado ganha do pós-fixado quando os juros ficam abaixo do esperado e perde quando ficam acima. Faz mais sentido quando o vencimento coincide com a data do seu objetivo.",
  },
  {
    titulo: "IPCA+: protege o poder de compra",
    texto:
      "Paga a inflação oficial (IPCA) mais uma taxa real fixa. Uma parte acompanha os preços e a outra fica travada, o que garante ganho acima da inflação no prazo combinado. " +
      "Por isso é usado para objetivos longos, como a aposentadoria. No caminho, o preço oscila mais que o dos outros tipos.",
  },
  {
    titulo: "Marcação a mercado: o preço muda antes do vencimento",
    texto:
      "Quem vende um prefixado ou um IPCA+ antes do prazo recebe o preço do dia, e não o combinado. Se os juros subiram desde a aplicação, o título vale menos, porque os novos pagam mais; se caíram, vale mais. " +
      "Levar até o vencimento garante a taxa contratada. Antes de aplicar, pergunte se aquele dinheiro pode mesmo ficar parado até a data final.",
  },
  {
    titulo: "Como escolher",
    texto:
      "1) Primeiro a reserva de emergência, num pós-fixado com liquidez diária. 2) Depois, case o prazo de cada investimento com o prazo do objetivo. " +
      "3) Divida o dinheiro entre os tipos em vez de tentar adivinhar a próxima decisão do Copom: nem os especialistas acertam sempre. " +
      "4) Desconfie de taxas muito acima das do mercado, porque retorno maior vem com risco maior. 5) Constância vale mais que acertar o momento: aplicar um pouco todo mês é o que faz os juros compostos trabalharem.",
  },
  {
    titulo: "No mundo real",
    texto:
      "Títulos públicos (Tesouro Direto) são garantidos pelo Tesouro Nacional. CDB, LCI e LCA contam com a garantia do FGC até um limite por instituição. " +
      "Na maioria dos casos, o imposto de renda da renda fixa segue uma tabela regressiva: quanto mais tempo o dinheiro fica aplicado, menor a alíquota. Compare sempre o rendimento já descontado de impostos e taxas.",
  },
];
