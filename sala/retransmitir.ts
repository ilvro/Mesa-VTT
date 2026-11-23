/** Lógica pura da sala: sem tipos do Workers, testável no Node. */

export interface ConexaoLike {
  send(dados: string): void;
}

/** Repete a mensagem a todas as conexões, menos à de quem mandou. Devolve quantas receberam. */
export function retransmitir(
  conexoes: readonly ConexaoLike[],
  origem: ConexaoLike,
  mensagem: string,
): number {
  let enviadas = 0;
  for (const c of conexoes) {
    if (c === origem) continue;
    try {
      c.send(mensagem);
      enviadas++;
    } catch {
      // conexão já fechada: ignora, o runtime a remove
    }
  }
  return enviadas;
}

/** Como `retransmitir`, mas só entre conexões já identificadas (a de origem também precisa ser). */
export function retransmitirIdentificados<C extends ConexaoLike>(
  conexoes: readonly C[],
  origem: C,
  mensagem: string,
  identificada: (c: C) => boolean,
): number {
  if (!identificada(origem)) return 0;
  return retransmitir(conexoes.filter(identificada), origem, mensagem);
}

const ORIGENS_FIXAS = ['https://ilvro.github.io', 'http://127.0.0.1:5100'];

/** Origens aceitas no CORS: o GitHub Pages, o dev local e qualquer https://*.discordsays.com. */
export function origemPermitida(origem: string | null): boolean {
  if (!origem) return false;
  if (ORIGENS_FIXAS.includes(origem)) return true;
  return /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.discordsays\.com$/i.test(origem);
}
