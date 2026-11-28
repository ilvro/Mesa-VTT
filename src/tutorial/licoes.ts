import type { Licao } from './tutor.ts';

export const PASTAS_DE_LICOES: readonly { id: string; nome: string; sobre: string }[] = [
  { id: 'quadro', nome: 'Quadro', sobre: 'Notas, marcadores, ligações, modelos e a projeção para os jogadores.' },
  { id: 'sessao', nome: 'Modo Sessão', sobre: 'O registro da sessão, os painéis e o foco do quadro.' },
  { id: 'campanha', nome: 'Campanha e mesa online', sobre: 'Preparar uma cena e o caminho da mesa online.' },
];

/** A lição de manutenção: só confere que o tutor, a campanha de treino e o cartão funcionam. Fica fora da lista (`?tutor-teste` a mostra). */
const TESTE_DO_MOTOR: Licao = {
  id: 'teste-do-motor', titulo: 'Teste do motor', minutos: 1, oculta: true,
  resumo: 'Confere o tutor e a campanha de treino.',
  semente: { quadro: { nome: 'Quadro de treino' }, abrirQuadro: true },
  passos: [
    { diga: 'Abra a aba <b>Quadros</b>.', alvo: '[data-testid="aba-quadros"]', feito: ['tela', 'quadros'], acao: ['clicar', '[data-testid="aba-quadros"]'], aprendeu: 'A aba Quadros guarda os quadros da campanha.' },
    { diga: 'Pegue a ferramenta <b>Nota adesiva</b>.', alvo: '[data-testid="ferramenta-nota"]', feito: ['ferramenta', 'nota'], acao: ['clicar', '[data-testid="ferramenta-nota"]'], aprendeu: ['N', 'pega a nota adesiva'] },
  ],
};

export const LICOES: readonly Licao[] = [TESTE_DO_MOTOR];
