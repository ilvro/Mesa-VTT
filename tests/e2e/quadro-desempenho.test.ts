import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarAmbiente, type Ambiente } from './apoio.ts';

let amb: Ambiente;
before(async () => {
  amb = await iniciarAmbiente();
});
after(async () => {
  await amb.encerrar();
});

test('Q2k: quadro com 3000 itens mantém quadros abaixo de 50 ms ao ver tudo e dar zoom', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') erros.push(m.text());
    });
    page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));

    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Q2k');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');

    await page.click('[data-testid="aba-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Quadro 3000');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');

    const url = page.url();
    const match = url.match(/#\/quadro\/([^/]+)/);
    assert.ok(match);
    const quadroId = decodeURIComponent(match[1]!);

    await page.evaluate(async (qId) => {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 48;
      const c2d = canvas.getContext('2d')!;
      c2d.fillStyle = '#5c7c69';
      c2d.fillRect(0, 0, 48, 48);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );

      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('mesa-quadros-v1', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['imagens', 'itens'], 'readwrite');
        tx.objectStore('imagens').put({
          id: 'img-perf-1',
          blob,
          tipo: 'image/png',
          largura: 48,
          altura: 48,
          criadaEm: 1,
        });

        const texto200 =
          'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut.';
        const store = tx.objectStore('itens');
        const cols = 60;

        for (let i = 0; i < 2770; i++) {
          const x = (i % cols) * 320;
          const y = Math.floor(i / cols) * 260;
          store.put({
            id: `t-${i}`,
            quadroId: qId,
            tipo: 'texto',
            x,
            y,
            largura: 220,
            altura: 180,
            rotacao: 0,
            z: i + 1,
            travado: false,
            soMestre: false,
            molduraId: null,
            grupoId: null,
            criadoEm: 1,
            atualizadoEm: 1,
            alturaAuto: false,
            semantica: null,
            doc: {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: texto200 }] }],
            },
            texto: {
              fonte: 'open-sans',
              tamanho: 14,
              cor: '#e8efe9',
              alinhamento: 'esquerda',
              vertical: 'topo',
            },
            caixa: {
              fundo: '#202b24',
              opacidade: 1,
              borda: '#35453b',
              espessuraBorda: 1,
              tracejado: 'solido',
              raio: 8,
              sombra: false,
              padding: 10,
            },
          });
        }

        for (let i = 0; i < 30; i++) {
          const idx = 2770 + i;
          const x = (idx % cols) * 320;
          const y = Math.floor(idx / cols) * 260;
          store.put({
            id: `im-${i}`,
            quadroId: qId,
            tipo: 'imagem',
            x,
            y,
            largura: 160,
            altura: 120,
            rotacao: 0,
            z: idx + 1,
            travado: false,
            soMestre: false,
            molduraId: null,
            grupoId: null,
            criadoEm: 1,
            atualizadoEm: 1,
            imagemId: 'img-perf-1',
            larguraOriginal: 48,
            alturaOriginal: 48,
            caixa: {
              fundo: null,
              opacidade: 1,
              borda: null,
              espessuraBorda: 0,
              tracejado: 'solido',
              raio: 4,
              sombra: false,
              padding: 0,
            },
          });
        }

        for (let i = 0; i < 200; i++) {
          store.put({
            id: `s-${i}`,
            quadroId: qId,
            tipo: 'seta',
            x: (i % cols) * 320,
            y: Math.floor(i / cols) * 260,
            largura: 320,
            altura: 180,
            rotacao: 0,
            z: 2800 + i,
            travado: false,
            soMestre: false,
            molduraId: null,
            grupoId: null,
            criadoEm: 1,
            atualizadoEm: 1,
            de: { itemId: `t-${i * 2}`, lado: 'direita' },
            para: { itemId: `t-${i * 2 + 1}`, lado: 'esquerda' },
            rota: 'curva',
            cor: '#a8b8ad',
            espessura: 2,
            tracejado: 'solido',
            inicio: 'nenhuma',
            fim: 'seta',
            rotulo: '',
          });
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, quadroId);

    await page.reload();
    await page.waitForSelector('[data-testid="area-quadro"]');
    await page.waitForSelector('[data-testid="minimapa-canvas"]');

    // Ver tudo (Shift+1)
    await page.keyboard.press('Shift+Digit1');
    await page.waitForTimeout(200);

    // Medir quadros ao aproximar e afastar 10 vezes
    await page.evaluate(() => {
      const tempos: number[] = [];
      (window as unknown as { __temposPerf: number[]; __medindoPerf: boolean }).__temposPerf = tempos;
      (window as unknown as { __medindoPerf: boolean }).__medindoPerf = true;
      let anterior = performance.now();
      const tick = () => {
        const agora = performance.now();
        tempos.push(agora - anterior);
        anterior = agora;
        if ((window as unknown as { __medindoPerf: boolean }).__medindoPerf) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Control+=');
      await page.waitForTimeout(40);
    }
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Control+-');
      await page.waitForTimeout(40);
    }

    const stats = await page.evaluate(() => {
      (window as unknown as { __medindoPerf: boolean }).__medindoPerf = false;
      const tempos = (window as unknown as { __temposPerf: number[] }).__temposPerf;
      const max = Math.max(0, ...tempos);
      const media = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : 0;
      return { max, media, quadros: tempos.length };
    });

    console.log(`Q2k perf (3000 itens): max=${stats.max.toFixed(1)}ms, media=${stats.media.toFixed(1)}ms, quadros=${stats.quadros}`);
    assert.ok(stats.max <= 50, `Quadro demorou ${stats.max.toFixed(1)}ms (> 50ms)`);
    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});
