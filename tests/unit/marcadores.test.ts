import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analisarMarcadores } from '../../src/dominio/marcadores.ts';

test('analisarMarcadores reconhece todos os exemplos da tabela de marcadores', () => {
  const casos: [string, unknown][] = [
    ['[PERCEPÇÃO 13]', { tipo: 'teste', pericias: ['PERCEPÇÃO'], dificuldade: 13 }],
    [
      '[INVESTIGAÇÃO/SOBREVIVÊNCIA 13]',
      { tipo: 'teste', pericias: ['INVESTIGAÇÃO', 'SOBREVIVÊNCIA'], dificuldade: 13 },
    ],
    [
      '[APTIDÃO - ATUALIDADES 8]',
      { tipo: 'teste', pericias: ['APTIDÃO', 'ATUALIDADES'], dificuldade: 8 },
    ],
    [
      '[INTUIÇÃO 6 - se quiserem arrombar]',
      { tipo: 'teste', pericias: ['INTUIÇÃO'], dificuldade: 6, nota: 'se quiserem arrombar' },
    ],
    [
      '[PERCEPÇÃO 15 (só antes de limparem)]',
      {
        tipo: 'teste',
        pericias: ['PERCEPÇÃO'],
        dificuldade: 15,
        nota: '(só antes de limparem)',
      },
    ],
    [
      '[ARROMBAR DT 7, PA 10]',
      { tipo: 'teste', pericias: ['ARROMBAR'], dificuldade: 7, nota: 'PA 10' },
    ],
    [
      '[PERCEPÇÃO 12 se:!poeira]',
      { tipo: 'teste', pericias: ['PERCEPÇÃO'], dificuldade: 12, condicao: '!poeira' },
    ],
    ['[LOOT] HANDOUT 07', { tipo: 'loot', rotulo: 'HANDOUT 07' }],
    ['[EVENTO]', { tipo: 'evento' }],
    ['[TAREFA]', { tipo: 'tarefa' }],
    ['Tarefa: falar com o taverneiro', { tipo: 'tarefa' }],
    ['[REVER]', { tipo: 'rever' }],
    ['[MÚSICA Bar – Festa]', { tipo: 'musica', nome: 'Bar – Festa' }],
    ['[DATA 1858]', { tipo: 'data', valor: '1858' }],
    ['[DATA 1785-04]', { tipo: 'data', valor: '1785-04' }],
    ['[SEGREDO se:chave=Naira]', { tipo: 'segredo', condicao: 'chave=Naira' }],
    ['[SINDRE]', { tipo: 'fala', quem: 'SINDRE' }],
    ['[KARL PARA OLE]', { tipo: 'fala', quem: 'KARL', para: 'OLE' }],
    ['[TEODOR]', { tipo: 'fala', quem: 'TEODOR' }],
    ['[DESAFIO DE ACESSO - CADEADO]', { tipo: 'rotulo', texto: 'DESAFIO DE ACESSO - CADEADO' }],
  ];

  for (const [entrada, esperado] of casos) {
    const trechos = analisarMarcadores(entrada);
    const marcador = trechos.find((t) => t.tipo === 'marcador');
    assert.ok(marcador && marcador.tipo === 'marcador', `Esperava marcador em: ${entrada}`);
    assert.deepEqual(marcador.marcador, esperado, `Falha em: ${entrada}`);
  }
});

test('analisarMarcadores trata casos de borda e preserva [[ligações]]', () => {
  assert.deepEqual(analisarMarcadores('[1] e [x] e [quebra\nde linha]'), [
    { tipo: 'texto', texto: '[1] e [x] e [quebra\nde linha]' },
  ]);

  const comLigacao = analisarMarcadores('Ver [[Sindre]] e [PERCEPÇÃO 10]');
  assert.equal(comLigacao[0]?.tipo, 'texto');
  assert.equal(comLigacao[1]?.tipo, 'ligacao');
  assert.equal(comLigacao[2]?.tipo, 'texto');
  assert.equal(comLigacao[3]?.tipo, 'marcador');
});
