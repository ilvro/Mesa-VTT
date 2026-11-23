import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { iniciarAmbiente, type Ambiente } from './apoio.ts';
import { montarPacote } from '../../src/dominio/pacote-quadro.ts';
import { novaNotaAdesiva, novoQuadro } from '../../src/dominio/quadro.ts';

let amb: Ambiente;
before(async () => {
  amb = await iniciarAmbiente();
});
after(async () => {
  await amb.encerrar();
});

test('E4d: importar um pacote, exportar o quadro e reimportar como cópia', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  try {
    const page = await ctx.newPage();
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Pacote');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');
    await page.click('[data-testid="aba-quadros"]');
    await page.waitForSelector('[data-testid="tela-quadros"]');

    // Pacote montado à mão com uma nota.
    const quadro = novoQuadro('qualquer', 'Porto', 1, 'q0');
    const nota = novaNotaAdesiva({ quadroId: 'q0', x: 10, y: 20 }, 1, 'n0');
    const zip = zipSync({ 'quadro.json': strToU8(montarPacote(quadro, [nota])) });
    await page.setInputFiles('[data-testid="importar-pacote-input"]', {
      name: 'porto.mesa-quadro.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(zip),
    });
    await page.waitForSelector('[data-testid="tela-quadro"]');
    assert.equal(await page.locator('[data-testid="quadro-nome"]').inputValue(), 'Porto');
    await page.click('[data-testid="voltar-quadros"]');
    await page.waitForSelector('[data-testid="tela-quadros"]');
    assert.equal(await page.locator('[data-testid^="cartao-quadro-"]').count(), 1);

    // Exportar.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid^="exportar-quadro-"]').first().click(),
    ]);
    assert.equal(download.suggestedFilename(), 'Porto.mesa-quadro.zip');
    const caminho = await download.path();
    const lido = unzipSync(new Uint8Array(readFileSync(caminho)));
    const pacote = JSON.parse(strFromU8(lido['quadro.json']!));
    assert.equal(pacote.formato, 'mesa-quadro');
    assert.equal(pacote.itens.length, 1);

    // Reimportar o exportado: nome igual vira cópia.
    await page.setInputFiles('[data-testid="importar-pacote-input"]', caminho);
    await page.waitForSelector('[data-testid="tela-quadro"]');
    assert.equal(await page.locator('[data-testid="quadro-nome"]').inputValue(), 'Porto (cópia)');

    // Arquivo que não é pacote: recusado, continua na tela.
    await page.click('[data-testid="voltar-quadros"]');
    await page.waitForSelector('[data-testid="tela-quadros"]');
    await page.setInputFiles('[data-testid="importar-pacote-input"]', {
      name: 'x.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(zipSync({ 'quadro.json': strToU8('{"formato":"outro"}') })),
    });
    await page.waitForSelector('text=não é um pacote de quadro da Mesa');
    assert.equal(await page.locator('[data-testid^="cartao-quadro-"]').count(), 2);
  } finally {
    await ctx.close();
  }
});
