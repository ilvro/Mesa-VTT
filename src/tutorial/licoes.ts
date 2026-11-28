import type { Acao, Licao, Passo } from './tutor.ts';
import type { Semente } from './semente.ts';

export const PASTAS_DE_LICOES: readonly { id: string; nome: string; sobre: string }[] = [
  { id: 'quadro', nome: 'Quadro', sobre: 'Notas, marcadores, ligações, modelos e a projeção para os jogadores.' },
  { id: 'sessao', nome: 'Modo Sessão', sobre: 'O registro da sessão, os painéis e o foco do quadro.' },
  { id: 'campanha', nome: 'Campanha e mesa online', sobre: 'Preparar uma cena e o caminho da mesa online.' },
];

const tid = (id: string) => `[data-testid="${id}"]`;
const clicar = (id: string): Acao => ['clicar', tid(id)];
const ler = (diga: string, porque?: string): Passo => ({ diga, ...(porque ? { porque } : {}), feito: ['ler'] });
const AREA = tid('area-quadro');

/** Os textos de nota que as lições pedem (na sintaxe real de `dominio/marcadores.ts`); `licoes.test.ts` confere o tipo de cada um. */
export const NOTA_TESTE = '[PERCEPÇÃO 13] marcas de unha na porta';
export const NOTA_SEGREDO = '[SEGREDO] o caseiro está no porão';
export const NOTA_FALA = '[CASEIRO] não tem ninguém aqui';
export const NOTA_LOOT = '[LOOT] chave enferrujada';
export const NOTA_LIGACAO = 'A [[Joana]] ouve passos no porão';

/** Uma nota com marcador: pega a ferramenta, clica dentro da moldura e escreve; o passo fecha quando o marcador existe. */
const notaCom = (tipo: string, texto: string, diga: string, porque: string, extra: Partial<Passo> = {}): Passo => ({
  diga: `${diga} <b>${texto}</b>`, porque, alvo: tid('ferramenta-nota'), valores: `<b>Texto</b>: ${texto}`,
  feito: ['e', ['marcador', tipo], ['dentroDeMoldura', 'texto', 1]], ...extra,
});

/** As entidades da campanha de treino das lições do Quadro. */
const ENTIDADES: NonNullable<Semente['entidades']> = [
  { tipo: 'personagem', nome: 'Joana' },
  { tipo: 'lugar', nome: 'Casa abandonada' },
  { tipo: 'pista', nome: 'Carta rasgada' },
];

const QUADRO_NOTAS: Licao = {
  id: 'quadro-notas', titulo: 'Quadro I · notas que viram jogo', minutos: 6, pasta: 'quadro', proxima: 'quadro-ligacoes',
  resumo: 'Uma moldura, quatro notas e os marcadores que a Mesa reconhece: teste, segredo, fala e loot.',
  semente: { entidades: ENTIDADES, quadro: { nome: 'Preparação' }, abrirQuadro: true, tela: 'quadros' },
  passos: [
    { diga: 'Pegue a ferramenta <b>Moldura</b>.', porque: 'A moldura agrupa o que pertence a uma cena: ela vira uma página na leitura e pode ser projetada.', alvo: tid('ferramenta-moldura'), feito: ['ferramenta', 'moldura'], acao: clicar('ferramenta-moldura'), aprendeu: ['F', 'pega a ferramenta Moldura'], etapa: 'A moldura' },
    { diga: 'Arraste no quadro, de um canto ao outro, para desenhar a moldura.', alvo: AREA, feito: ['itens', 'moldura', 1] },
    { diga: 'Dê <b>dois cliques</b> dentro da moldura e escreva <b>Casa abandonada</b>; confirme com Enter.', porque: 'O título é o nome da página na leitura e na projeção.', alvo: AREA, valores: '<b>Título</b>: Casa abandonada', feito: ['molduraComTitulo', 'Casa abandonada'], aprendeu: 'Dois cliques na moldura renomeiam o título.' },
    notaCom('teste', NOTA_TESTE, 'Pegue a <b>Nota adesiva</b>, clique dentro da moldura e escreva', 'Um teste entre colchetes (perícia e dificuldade) vira um marcador com a dificuldade à vista.', { etapa: 'As notas e os marcadores', aprendeu: ['N', 'pega a nota adesiva'] }),
    notaCom('segredo', NOTA_SEGREDO, 'Outra nota dentro da moldura:', '<b>[SEGREDO]</b> marca o que só o mestre sabe: não vai para a projeção.'),
    notaCom('fala', NOTA_FALA, 'Uma fala, com o nome de quem fala em maiúsculas:', 'Um nome em maiúsculas entre colchetes vira uma fala, e a Mesa a destaca no roteiro.'),
    notaCom('loot', NOTA_LOOT, 'E o que o grupo pode levar:', 'O texto depois de <b>[LOOT]</b> é o item; o quadro o reconhece como recompensa.'),
    ler('Cada marcador ganha uma etiqueta colorida sozinho, sem você escolher nada. As cores de cada tipo ficam em <b>Painéis ▾ → Paleta</b>, e a próxima lição liga estas notas às fichas.', 'Escrever do jeito natural e deixar a Mesa reconhecer é o que mantém o quadro rápido durante a prep.'),
  ],
};

const QUADRO_LIGACOES: Licao = {
  id: 'quadro-ligacoes', titulo: 'Quadro II · ligações, modelos e projeção', minutos: 7, pasta: 'quadro',
  resumo: 'Ligar notas às fichas, setas, modelo de cena, fila de revisão, modo Ler e projeção para os jogadores.',
  semente: {
    entidades: ENTIDADES, tela: 'quadros', abrirQuadro: true,
    quadro: {
      nome: 'Preparação',
      itens: [
        { tipo: 'moldura', x: 60, y: 60, largura: 640, altura: 340, titulo: 'Casa abandonada' },
        { tipo: 'nota', x: 30, y: 50, largura: 240, altura: 100, molduraDe: 'Casa abandonada', texto: NOTA_TESTE },
        { tipo: 'nota', x: 340, y: 50, largura: 240, altura: 100, molduraDe: 'Casa abandonada', texto: NOTA_SEGREDO },
        ...[['Cheiro de mofo no corredor', 60], ['Um relógio parado às 3h', 190], ['Cortinas fechadas há anos', 320]].map(([texto, y]) => ({ tipo: 'nota' as const, x: 780, y: y as number, largura: 220, altura: 90, texto: texto as string, revisao: { tipoSugerido: 'leitura' as const, motivos: ['veio do Miro'], origem: 'miro' as const } })),
      ],
    },
  },
  passos: [
    { diga: 'A fila de revisão guarda as notas trazidas do Miro. Em <b>Aceitar 3</b>, clique e depois em <b>Confirmar</b> para aceitar tudo.', porque: 'Se a fila estiver fechada, abra pelo botão <b>Revisão</b> da barra do quadro.', alvo: '[data-testid^="revisao-massa-"]', feito: ['semRevisao'], etapa: 'Revisão do que veio do Miro' },
    { diga: 'Pegue a ferramenta <b>Nota adesiva</b>.', alvo: tid('ferramenta-nota'), feito: ['ferramenta', 'nota'], acao: clicar('ferramenta-nota'), aprendeu: ['N', 'pega a nota adesiva'], etapa: 'Ligar ao que já existe' },
    { diga: `Clique num espaço livre, abaixo da moldura, e escreva <b>${NOTA_LIGACAO}</b>. Ao digitar <b>[[</b> a Mesa sugere as fichas.`, porque: 'Entre colchetes duplos o nome vira um link para a ficha: um clique abre a Joana.', alvo: AREA, valores: `<b>Texto</b>: ${NOTA_LIGACAO}`, feito: ['ligacaoNoTexto', 'Joana'] },
    { diga: 'Pegue a ferramenta <b>Entidade</b>.', alvo: tid('ferramenta-entidade'), feito: ['ferramenta', 'entidade'], acao: clicar('ferramenta-entidade') },
    { diga: 'Clique num espaço livre do quadro e escolha a <b>Carta rasgada</b> na lista.', porque: 'O cartão de uma entidade fica no quadro ligado à ficha, não é uma cópia.', alvo: AREA, valores: '<b>Entidade</b>: Carta rasgada', feito: ['refDe', 'pista'] },
    { diga: 'Pegue a ferramenta <b>Seta</b>.', alvo: tid('ferramenta-seta'), feito: ['ferramenta', 'seta'], acao: clicar('ferramenta-seta'), aprendeu: ['L', 'pega a ferramenta Seta'], etapa: 'Setas' },
    { diga: 'Arraste de uma nota da moldura até a outra, soltando em cima dela.', porque: 'Uma seta presa às duas pontas acompanha as notas quando você as move.', alvo: AREA, feito: ['setaLigada', 1] },
    { diga: 'Clique na moldura (na borda ou num espaço vazio dela) para selecioná-la.', alvo: AREA, feito: ['selecaoDe', 'moldura'], etapa: 'Modelo de cena' },
    { diga: 'Clique com o <b>botão direito</b> na moldura, escolha <b>Salvar como modelo…</b>, dê o nome <b>Casa abandonada</b> e salve.', porque: 'Um modelo guarda a moldura com o que há dentro, para carimbar em outro quadro.', alvo: AREA, valores: '<b>Nome</b>: Casa abandonada', feito: ['modelos', 1], aprendeu: 'O botão direito abre o menu do item: modelo, projeção e mais.' },
    { diga: 'Mude para <b>Ler</b>.', porque: 'Ler mostra o quadro como página, moldura por moldura: ótimo para repassar a cena antes de jogar.', alvo: tid('modo-ler'), feito: ['modoQuadro', 'ler'], acao: clicar('modo-ler'), etapa: 'Leitura e projeção' },
    { diga: 'Volte para <b>Quadro</b>.', alvo: tid('modo-quadro'), feito: ['modoQuadro', 'quadro'], acao: clicar('modo-quadro') },
    ler('A projeção mostra aos jogadores só o que é deles: <b>[SEGREDO]</b>, testes e itens marcados como <b>só mestre</b> não aparecem.', 'Você pode projetar com o quadro aberto sem se preocupar com o que está anotado ali.'),
    { diga: 'Clique com o <b>botão direito</b> na moldura e escolha <b>Mostrar aos jogadores</b>.', porque: 'Abre uma janela só com a moldura, para pôr no segundo monitor.', alvo: AREA, feito: ['projetando'] },
    { diga: 'Pare a projeção em <b>Parar</b>.', alvo: tid('parar-projecao'), feito: ['naoProjetando'], acao: clicar('parar-projecao'), aprendeu: 'Mostrar aos jogadores abre a moldura numa janela própria; Parar a fecha.' },
  ],
};

export const LICOES_DO_QUADRO: readonly Licao[] = [QUADRO_NOTAS, QUADRO_LIGACOES];

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

export const LICOES: readonly Licao[] = [...LICOES_DO_QUADRO, TESTE_DO_MOTOR];
