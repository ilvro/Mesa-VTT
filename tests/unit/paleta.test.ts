import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { docParaHtml } from '../../src/dominio/doc-rico.ts';
import { docDeTexto } from '../../src/dominio/quadro.ts';
import {
  PALETA_PADRAO,
  corDoTexto,
  decorarMarcadores,
  fundoEfetivo,
  resolverPaleta,
  tipoMaisProximo,
} from '../../src/dominio/paleta.ts';

describe('paleta semântica', () => {
  it('calcula corDoTexto por contraste de luminância', () => {
    assert.equal(corDoTexto(PALETA_PADRAO.leitura), '#111111');
    assert.equal(corDoTexto(PALETA_PADRAO.teste), '#111111');
    assert.equal(corDoTexto('#1e293b'), '#ffffff');
    assert.equal(corDoTexto('#000'), '#ffffff');
    assert.equal(corDoTexto('#fff'), '#111111');
  });

  it('tipoMaisProximo encontra o tipo dentro do limite ou retorna null', () => {
    assert.equal(tipoMaisProximo('#f7e48c', PALETA_PADRAO, 65), 'leitura');
    assert.equal(tipoMaisProximo('#78a5ee', PALETA_PADRAO, 65), 'teste');
    assert.equal(tipoMaisProximo('#111111', PALETA_PADRAO, 65), null);
    assert.equal(tipoMaisProximo('invalido', PALETA_PADRAO, 65), null);
  });

  it('resolverPaleta e fundoEfetivo respeitam overrides e fundo manual', () => {
    const paleta = resolverPaleta({ teste: '#1d4ed8' });
    assert.equal(paleta.teste, '#1d4ed8');
    assert.equal(paleta.leitura, PALETA_PADRAO.leitura);

    assert.equal(fundoEfetivo({ caixa: { fundo: null }, semantica: 'teste' }, paleta), '#1d4ed8');
    assert.equal(fundoEfetivo({ caixa: { fundo: '#ffffff' }, semantica: 'teste' }, paleta), '#ffffff');
    assert.equal(fundoEfetivo({ caixa: { fundo: null }, semantica: null }, paleta), null);
  });

  it('docParaHtml com decorarMarcadores gera chips e preserva escape de HTML', () => {
    const doc = docDeTexto(
      'Fazer [PERCEPÇÃO 13 se:poeira] e [SEGREDO] com <script>alert(1)</script> & [MÚSICA <b>Tema</b>]',
    );
    const html = docParaHtml(doc, { decorar: decorarMarcadores });

    assert.match(html, /class="chip-marcador chip-teste"/);
    assert.match(html, /<strong class="chip-dt">DT 13<\/strong>/);
    assert.match(html, /<em class="chip-condicao">se:poeira<\/em>/);
    assert.match(html, /class="chip-marcador chip-segredo"/);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp;'));
    assert.ok(!html.includes('<b>Tema</b>'));
    assert.ok(html.includes('&lt;b&gt;Tema&lt;/b&gt;'));
  });
});
