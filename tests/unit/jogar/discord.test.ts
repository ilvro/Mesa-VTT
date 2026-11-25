import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { attemptRemap } from '@discord/embedded-app-sdk';
import {
  atualizarAtividadeDiscord,
  baseDoAppNoDiscord,
  iniciarAtividadeDiscord,
  ligarSalaNoDiscord,
  mapeamentosDiscord,
  type SdkDiscordLike,
} from '../../../src/jogar/discord.ts';
import { ehAtividadeDoDiscord } from '../../../src/jogar/modo-discord.ts';

function criarSdkFalso(o: {
  guildId?: string | null;
  code?: string;
  aoAutorizar?: (args: unknown) => void;
  aoAutenticar?: (args: unknown) => void;
  aoSetActivity?: (args: unknown) => void;
  falharSetActivity?: boolean;
} = {}): SdkDiscordLike {
  return {
    guildId: o.guildId ?? 'guild-1',
    channelId: 'canal-1',
    instanceId: 'inst-1',
    async ready() {},
    commands: {
      async authorize(args) {
        o.aoAutorizar?.(args);
        return { code: o.code ?? 'cod-123' };
      },
      async authenticate(args) {
        o.aoAutenticar?.(args);
        return {};
      },
      async setActivity(args) {
        o.aoSetActivity?.(args);
        if (o.falharSetActivity) throw new Error('rpc falhou');
        return {};
      },
    },
  };
}

describe('ehAtividadeDoDiscord', () => {
  it('detecta frame_id na query string', () => {
    assert.equal(ehAtividadeDoDiscord('?frame_id=abc&instance_id=1'), true);
    assert.equal(ehAtividadeDoDiscord('?instance_id=1&frame_id=xyz'), true);
  });

  it('retorna false sem frame_id ou com frame_id vazio', () => {
    assert.equal(ehAtividadeDoDiscord(''), false);
    assert.equal(ehAtividadeDoDiscord('?sala=1'), false);
    assert.equal(ehAtividadeDoDiscord('?frame_id='), false);
  });
});

describe('iniciarAtividadeDiscord', () => {
  it('autentica via /.proxy/sala/token sem redirectUri e resolve a sala do servidor', async () => {
    const chamadas: Array<{ url: string; method?: string; body?: string; auth?: string }> = [];
    let authArgs: unknown = null;
    let authenticateArgs: unknown = null;

    const sdk = criarSdkFalso({
      guildId: 'guild-42',
      aoAutorizar: a => { authArgs = a; },
      aoAutenticar: a => { authenticateArgs = a; },
    });

    const fakeFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      chamadas.push({ url, method: init?.method, body: init?.body ? String(init.body) : undefined, auth: headers.Authorization });

      if (url === '/.proxy/sala/token') {
        return new Response(JSON.stringify({
          access_token: 'tok-abc',
          sessao: 'sessao-jwt',
          eu: { discordId: 'u1', nome: 'Jogadora', avatar: null, podeMestrar: false },
        }), { status: 200 });
      }
      if (url === '/.proxy/sala/diretorio/guild-42') {
        return new Response(JSON.stringify({ salaId: 'sala-99' }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    const res = await iniciarAtividadeDiscord({ sdk, fetch: fakeFetch, patchMappings: false });

    assert.equal(res.estado, 'pronta');
    if (res.estado === 'pronta') {
      assert.equal(res.salaId, 'sala-99');
      assert.equal(res.sessao, 'sessao-jwt');
      assert.equal(res.eu.nome, 'Jogadora');
    }

    assert.deepEqual(authArgs, {
      client_id: '1573405277389197415',
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify'],
    });
    assert.deepEqual(authenticateArgs, { access_token: 'tok-abc' });
    assert.equal(chamadas[0]?.url, '/.proxy/sala/token');
    assert.deepEqual(JSON.parse(chamadas[0]!.body!), { code: 'cod-123' });
    assert.equal(chamadas[1]?.url, '/.proxy/sala/diretorio/guild-42');
    assert.equal(chamadas[1]?.auth, 'Bearer sessao-jwt');
  });

  it('retorna sem-sala para jogador quando não há sala ligada ao servidor', async () => {
    const chamadas: string[] = [];
    const sdk = criarSdkFalso({ guildId: 'guild-sem-sala' });
    const fakeFetch: typeof fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      chamadas.push(url);
      if (url === '/.proxy/sala/token') {
        return new Response(JSON.stringify({
          access_token: 'tok',
          sessao: 's-1',
          eu: { discordId: 'u2', nome: 'Jogador', avatar: null, podeMestrar: false },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ erro: 'nenhuma sala ligada' }), { status: 404 });
    }) as typeof fetch;

    const res = await iniciarAtividadeDiscord({ sdk, fetch: fakeFetch, patchMappings: false });

    assert.equal(res.estado, 'sem-sala');
    if (res.estado === 'sem-sala') {
      assert.deepEqual(res.salas, []);
    }
    assert.deepEqual(chamadas, ['/.proxy/sala/token', '/.proxy/sala/diretorio/guild-sem-sala']);
  });

  it('lista as salas do mestre quando não há sala ligada ao servidor', async () => {
    const sdk = criarSdkFalso({ guildId: 'guild-nova' });
    const fakeFetch: typeof fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/.proxy/sala/token') {
        return new Response(JSON.stringify({
          access_token: 'tok',
          sessao: 's-mestre',
          eu: { discordId: 'm1', nome: 'Mestre', avatar: null, podeMestrar: true },
        }), { status: 200 });
      }
      if (url === '/.proxy/sala/diretorio/guild-nova') {
        return new Response(JSON.stringify({ erro: 'nenhuma sala ligada' }), { status: 404 });
      }
      if (url === '/.proxy/sala/minhas') {
        return new Response(JSON.stringify({
          salas: [{ salaId: 'sala-a', nome: 'Maldição de Strahd', criadaEm: 1000 }],
        }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    const res = await iniciarAtividadeDiscord({ sdk, fetch: fakeFetch, patchMappings: false });

    assert.equal(res.estado, 'sem-sala');
    if (res.estado === 'sem-sala') {
      assert.equal(res.salas.length, 1);
      assert.equal(res.salas[0]?.salaId, 'sala-a');
      assert.equal(res.salas[0]?.nome, 'Maldição de Strahd');
    }
  });
});

describe('ligarSalaNoDiscord, atualizarAtividadeDiscord e baseDoAppNoDiscord', () => {
  it('envia POST para /.proxy/sala/diretorio/ligar', async () => {
    let chamado: { url: string; body: string } | null = null;
    const fakeFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      chamado = { url: String(input), body: String(init?.body ?? '') };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    await ligarSalaNoDiscord({ sessao: 's-m', guildId: 'g-1', salaId: 'sala-a', fetch: fakeFetch });
    assert.deepEqual(chamado, {
      url: '/.proxy/sala/diretorio/ligar',
      body: JSON.stringify({ guildId: 'g-1', salaId: 'sala-a' }),
    });
  });

  it('chama setActivity com o nome da campanha e ignora falhas', async () => {
    let recebido: unknown = null;
    const sdk = criarSdkFalso({ aoSetActivity: a => { recebido = a; } });
    await atualizarAtividadeDiscord(sdk, 'A Tumba da Aniquilação');
    assert.deepEqual(recebido, { activity: { type: 0, details: 'A Tumba da Aniquilação' } });

    const sdkFalho = criarSdkFalso({ falharSetActivity: true });
    await atualizarAtividadeDiscord(sdkFalho, 'Qualquer');
  });

  it('monta URLs de Atlas e Dossiê sob /.proxy/', () => {
    const aqui = 'https://1573405277389197415.discordsays.com/?frame_id=123';
    assert.equal(baseDoAppNoDiscord('atlas', aqui), 'https://1573405277389197415.discordsays.com/.proxy/Atlas/');
    assert.equal(baseDoAppNoDiscord('ficha', aqui), 'https://1573405277389197415.discordsays.com/.proxy/Dossie/');
  });

  it('mapeamentosDiscord reescreve URL do Worker para /.proxy/sala/... sem duplicar /sala', () => {
    const globalRef = globalThis as { window?: unknown };
    const anterior = globalRef.window;
    const tinha = 'window' in globalRef;
    globalRef.window = { location: { host: '1573405277389197415.discordsays.com' } };
    try {
      const remapped = attemptRemap({
        url: new URL('https://mesa-sala.ilvro-ermes.workers.dev/sala/token'),
        mappings: mapeamentosDiscord(),
      });
      assert.equal(remapped.pathname, '/.proxy/sala/token');
      assert.equal(remapped.toString(), 'https://1573405277389197415.discordsays.com/.proxy/sala/token');
    } finally {
      if (tinha) globalRef.window = anterior;
      else delete globalRef.window;
    }
  });
});
