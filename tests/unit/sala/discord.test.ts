import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErroDiscord, filtrarGuildasInstaladas, lerGuildas, lerUsuario, trocarCodigo, urlAvatarCdnDiscord, type FetchLike } from '../../../sala/discord.ts';

function falso(status: number, corpo: unknown) {
  const chamadas: { url: string; init?: Parameters<FetchLike>[1] }[] = [];
  const f: FetchLike = async (url, init) => {
    chamadas.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => corpo };
  };
  return { f, chamadas };
}

const base = { code: 'cod', clientId: 'cid', clientSecret: 'SEGREDO-X' };

test('trocarCodigo sem redirect_uri', async () => {
  const { f, chamadas } = falso(200, { access_token: 'tok' });
  assert.equal(await trocarCodigo({ ...base, fetch: f }), 'tok');
  const c = chamadas[0]!;
  assert.equal(c.url, 'https://discord.com/api/oauth2/token');
  assert.equal(c.init?.method, 'POST');
  assert.equal(c.init?.headers?.['Content-Type'], 'application/x-www-form-urlencoded');
  const p = new URLSearchParams(c.init?.body);
  assert.equal(p.get('grant_type'), 'authorization_code');
  assert.equal(p.get('code'), 'cod');
  assert.equal(p.get('client_id'), 'cid');
  assert.equal(p.get('client_secret'), 'SEGREDO-X');
  assert.equal(p.has('redirect_uri'), false);
});

test('trocarCodigo com redirect_uri', async () => {
  const { f, chamadas } = falso(200, { access_token: 'tok' });
  await trocarCodigo({ ...base, redirectUri: 'https://ilvro.github.io/Mesa-VTT/', fetch: f });
  assert.equal(new URLSearchParams(chamadas[0]!.init?.body).get('redirect_uri'), 'https://ilvro.github.io/Mesa-VTT/');
});

test('erro do Discord vira motivo legível, sem o segredo', async () => {
  const { f } = falso(400, { error: 'invalid_grant', error_description: 'Invalid "code" in request.' });
  await assert.rejects(trocarCodigo({ ...base, fetch: f }), (e: Error) => {
    assert.ok(e instanceof ErroDiscord);
    assert.match(e.message, /400/);
    assert.match(e.message, /Invalid "code"/);
    assert.ok(!e.message.includes('SEGREDO-X'));
    return true;
  });
  const sem = falso(200, {});
  await assert.rejects(trocarCodigo({ ...base, fetch: sem.f }), ErroDiscord);
  const rede: FetchLike = async () => { throw new Error('SEGREDO-X caiu'); };
  await assert.rejects(trocarCodigo({ ...base, fetch: rede }), (e: Error) => !e.message.includes('SEGREDO-X'));
});

test('lerUsuario: global_name, username e avatar', async () => {
  const a = falso(200, { id: '7', username: 'u', global_name: 'Nome Global', avatar: 'abc' });
  assert.deepEqual(await lerUsuario('tok', a.f), { discordId: '7', nome: 'Nome Global', avatar: 'abc' });
  assert.equal(a.chamadas[0]!.url, 'https://discord.com/api/users/@me');
  assert.equal(a.chamadas[0]!.init?.headers?.Authorization, 'Bearer tok');
  const b = falso(200, { id: '7', username: 'u', global_name: null, avatar: null });
  assert.deepEqual(await lerUsuario('tok', b.f), { discordId: '7', nome: 'u', avatar: null });
});

test('lerUsuario trata erro', async () => {
  const { f } = falso(401, { message: '401: Unauthorized' });
  await assert.rejects(lerUsuario('ruim', f), /401.*Unauthorized/);
  await assert.rejects(lerUsuario('x', falso(200, { foo: 1 }).f), ErroDiscord);
});

test('lerGuildas lista servidores e filtrarGuildasInstaladas cruza com as vistas pela atividade', async () => {
  const { f, chamadas } = falso(200, [
    { id: 'g1', name: 'Mesa do Sábado', icon: 'ic1' },
    { id: 'g2', name: 'Outro Servidor', icon: null },
    { id: 123, name: 'inválido' },
  ]);
  const guildas = await lerGuildas('tok', f);
  assert.equal(chamadas[0]!.url, 'https://discord.com/api/users/@me/guilds');
  assert.equal(chamadas[0]!.init?.headers?.Authorization, 'Bearer tok');
  assert.deepEqual(guildas, [
    { id: 'g1', name: 'Mesa do Sábado', icon: 'ic1' },
    { id: 'g2', name: 'Outro Servidor', icon: null },
  ]);
  assert.deepEqual(filtrarGuildasInstaladas(guildas, ['g2', 'g3']), [
    { id: 'g2', name: 'Outro Servidor', icon: null },
  ]);
});

test('urlAvatarCdnDiscord valida caminho e tamanho do avatar do Discord', () => {
  assert.equal(
    urlAvatarCdnDiscord('/sala/cdn/avatars/123456789/a_hash123.png', '128'),
    'https://cdn.discordapp.com/avatars/123456789/a_hash123.png?size=128',
  );
  assert.equal(
    urlAvatarCdnDiscord('/sala/cdn/avatars/123456789/hash.webp', '999'),
    'https://cdn.discordapp.com/avatars/123456789/hash.webp?size=128',
  );
  assert.equal(urlAvatarCdnDiscord('/sala/cdn/avatars/nao-numero/hash.png', '128'), null);
  assert.equal(urlAvatarCdnDiscord('/sala/cdn/avatars/123/../evil.png', '128'), null);
  assert.equal(urlAvatarCdnDiscord('/sala/cdn/outro/123/hash.png', '128'), null);
});
