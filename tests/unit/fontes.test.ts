import { test } from 'node:test';
import assert from 'node:assert/strict';
import { familiaCss, FONTES } from '../../src/dominio/fontes.ts';
import { IDS_FONTE } from '../../src/dominio/quadro.ts';

test('todo IdFonte tem entrada em FONTES e gera familiaCss com reserva', () => {
  for (const id of IDS_FONTE) {
    const info = FONTES[id];
    assert.ok(info, `faltou entrada para ${id}`);
    assert.ok(info.nome.length > 0);
    const css = familiaCss(id);
    assert.ok(css.includes(','));
  }
});
