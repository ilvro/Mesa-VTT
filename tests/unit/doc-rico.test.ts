import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docParaHtml } from '../../src/dominio/doc-rico.ts';
import type { DocRico } from '../../src/dominio/quadro.ts';

test('docParaHtml escapa script e atributos on*', () => {
  const doc: DocRico = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '<script>alert(1)</script><img onerror="x()">' }],
      },
    ],
  };
  const html = docParaHtml(doc);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('docParaHtml descarta cor inválida, fonte desconhecida, tamanho fora da faixa e javascript:', () => {
  const doc: DocRico = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'seguro',
            marks: [
              { type: 'link', attrs: { href: 'javascript:alert(1)' } },
              {
                type: 'textStyle',
                attrs: {
                  color: 'expression(alert(1))',
                  backgroundColor: '#ff0',
                  fontFamily: 'Fonte Maliciosa',
                  fontSize: '999px',
                },
              },
            ],
          },
        ],
      },
    ],
  };
  const html = docParaHtml(doc);
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('<a '));
  assert.ok(!html.includes('expression'));
  assert.ok(!html.includes('Fonte Maliciosa'));
  assert.ok(!html.includes('999px'));
  assert.ok(html.includes('background-color:#ff0'));
});

test('docParaHtml gera listas, títulos, alinhamento e links http/mesa', () => {
  const doc: DocRico = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2, textAlign: 'center' },
        content: [{ type: 'text', text: 'Título', marks: [{ type: 'bold' }] }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Mapa',
                    marks: [{ type: 'link', attrs: { href: 'mesa:atlas/mapa/m1' } }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const html = docParaHtml(doc);
  assert.ok(html.includes('<h2 style="text-align:center"><strong>Título</strong></h2>'));
  assert.ok(html.includes('<ul><li><p><a href="mesa:atlas/mapa/m1" data-mesa-ref="mesa:atlas/mapa/m1">Mapa</a></p></li></ul>'));
});
