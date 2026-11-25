/** Integração da casca do jogador com o Embedded App SDK do Discord (R17). */
import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import type { EuOnline } from '../app/online-login.ts';
import { PASTA_DO_APP } from '../dominio/entidades.ts';
import { DISCORD_CLIENT_ID, URL_SALA_PRODUCAO } from '../online/config.ts';

export const BASE_PROXY_DISCORD = '/.proxy';

export interface SalaDoMestre {
  salaId: string;
  nome: string;
  criadaEm: number;
}

export interface SdkDiscordLike {
  readonly guildId: string | null;
  readonly channelId: string | null;
  readonly instanceId: string;
  ready(): Promise<void>;
  commands: {
    authorize(args: {
      client_id: string;
      response_type: 'code';
      state: string;
      prompt: 'none';
      scope: 'identify'[];
    }): Promise<{ code: string }>;
    authenticate(args: { access_token: string }): Promise<unknown>;
    setActivity(args: { activity: { type?: number; details?: string; state?: string } }): Promise<unknown>;
  };
}

export type ResultadoDiscord =
  | {
    estado: 'pronta';
    sessao: string;
    eu: EuOnline;
    salaId: string;
    guildId: string | null;
    sdk: SdkDiscordLike;
  }
  | {
    estado: 'sem-sala';
    sessao: string;
    eu: EuOnline;
    guildId: string | null;
    salas: SalaDoMestre[];
    sdk: SdkDiscordLike;
  };

export interface OpcoesDiscord {
  sdk?: SdkDiscordLike;
  fetch?: typeof fetch;
  baseSala?: string;
  patchMappings?: boolean;
}

/** Lista de mapeamentos de URL usados pelo proxy do Discord (`/.proxy/sala` -> Worker da sala). */
export function mapeamentosDiscord(): Array<{ prefix: string; target: string }> {
  const hostSala = new URL(URL_SALA_PRODUCAO).host;
  return [{ prefix: `${BASE_PROXY_DISCORD}/sala`, target: `${hostSala}/sala` }];
}

/** Aplica `patchUrlMappings` para redirecionar chamadas absolutas ao Worker pelo proxy do Discord (`/.proxy/sala`). */
export function aplicarMapeamentosDiscord(): void {
  patchUrlMappings(mapeamentosDiscord());
}

/** Base dos aplicativos irmãos dentro da atividade (`/.proxy/Atlas/`, `/.proxy/Dossie/`, `/.proxy/Jukebox/`). */
export function baseDoAppNoDiscord(app: 'atlas' | 'ficha' | 'jukebox', aqui: string | URL = location.href): string {
  return new URL(`${BASE_PROXY_DISCORD}/${PASTA_DO_APP[app]}/`, aqui).href;
}

/** Consulta o diretório para descobrir a sala ligada ao servidor (`guildId`) ou, para o mestre, lista as salas dele. */
export async function descobrirSalaDoServidor(o: {
  sessao: string;
  eu: EuOnline;
  guildId: string | null;
  sdk: SdkDiscordLike;
  fetch?: typeof fetch;
  baseSala?: string;
}): Promise<ResultadoDiscord> {
  const f = o.fetch ?? fetch;
  const base = (o.baseSala ?? BASE_PROXY_DISCORD).replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${o.sessao}` };

  if (o.guildId) {
    const r = await f(`${base}/sala/diretorio/${encodeURIComponent(o.guildId)}`, { headers });
    if (r.ok) {
      const d = (await r.json().catch(() => ({}))) as { salaId?: unknown };
      if (typeof d.salaId === 'string' && d.salaId) {
        return { estado: 'pronta', sessao: o.sessao, eu: o.eu, salaId: d.salaId, guildId: o.guildId, sdk: o.sdk };
      }
    } else if (r.status !== 404) {
      const d = (await r.json().catch(() => ({}))) as { erro?: string };
      throw new Error(d.erro ?? `A sala respondeu ${r.status}.`);
    }
  }

  let salas: SalaDoMestre[] = [];
  if (o.eu.podeMestrar) {
    const r = await f(`${base}/sala/minhas`, { headers });
    if (r.ok) {
      const d = (await r.json().catch(() => ({}))) as { salas?: SalaDoMestre[] };
      salas = Array.isArray(d.salas) ? d.salas : [];
    }
  }

  return { estado: 'sem-sala', sessao: o.sessao, eu: o.eu, guildId: o.guildId, salas, sdk: o.sdk };
}

/** Liga uma sala ao servidor do Discord pelo caminho mapeado (`/.proxy/sala/diretorio/ligar`). */
export async function ligarSalaNoDiscord(o: {
  sessao: string;
  guildId: string;
  salaId: string;
  fetch?: typeof fetch;
  baseSala?: string;
}): Promise<void> {
  const f = o.fetch ?? fetch;
  const base = (o.baseSala ?? BASE_PROXY_DISCORD).replace(/\/+$/, '');
  const r = await f(`${base}/sala/diretorio/ligar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${o.sessao}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId: o.guildId, salaId: o.salaId }),
  });
  if (!r.ok) {
    const d = (await r.json().catch(() => ({}))) as { erro?: string };
    throw new Error(d.erro ?? `Não foi possível ligar a sala (${r.status}).`);
  }
}

/** Atualiza a atividade exibida no perfil do Discord com o nome da campanha. */
export async function atualizarAtividadeDiscord(sdk: SdkDiscordLike, nomeCampanha: string): Promise<void> {
  try {
    await sdk.commands.setActivity({
      activity: {
        type: 0,
        details: nomeCampanha.trim() || 'Mesa online',
      },
    });
  } catch {
    /* setActivity é opcional e não deve derrubar a mesa */
  }
}

/** Controla o singleton do SDK do Discord, limpando-o se `ready()` falhar para permitir nova tentativa. */
export function criarControladorSdkDiscord<T extends SdkDiscordLike>(criar: () => T): () => { sdk: T; pronto: Promise<void> } {
  let compartilhado: { sdk: T; pronto: Promise<void> } | null = null;
  return () => {
    if (!compartilhado) {
      const sdk = criar();
      const pronto = sdk.ready().catch(err => {
        compartilhado = null;
        throw err;
      });
      compartilhado = { sdk, pronto };
    }
    return compartilhado;
  };
}

const obterSdkDiscord = criarControladorSdkDiscord(() => new DiscordSDK(DISCORD_CLIENT_ID));

/** Fluxo completo de entrada na Atividade do Discord: `ready` -> `authorize` -> `/sala/token` -> `authenticate` -> diretório. */
export async function iniciarAtividadeDiscord(opcoes: OpcoesDiscord = {}): Promise<ResultadoDiscord> {
  if (opcoes.patchMappings !== false && typeof window !== 'undefined') {
    aplicarMapeamentosDiscord();
  }
  const f = opcoes.fetch ?? fetch;
  const base = (opcoes.baseSala ?? BASE_PROXY_DISCORD).replace(/\/+$/, '');
  if (opcoes.sdk) {
    await opcoes.sdk.ready();
  }
  const padrao = opcoes.sdk ? null : obterSdkDiscord();
  const sdk = opcoes.sdk ?? padrao!.sdk;
  if (padrao) await padrao.pronto;
  const { code } = await sdk.commands.authorize({
    client_id: DISCORD_CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });

  const resp = await f(`${base}/sala/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const dados = (await resp.json().catch(() => ({}))) as {
    access_token?: unknown;
    sessao?: unknown;
    eu?: EuOnline;
    erro?: string;
  };
  if (!resp.ok || typeof dados.access_token !== 'string' || typeof dados.sessao !== 'string' || !dados.eu) {
    throw new Error(dados.erro ?? 'Não foi possível entrar pelo Discord.');
  }

  await sdk.commands.authenticate({ access_token: dados.access_token });

  return descobrirSalaDoServidor({
    sessao: dados.sessao,
    eu: dados.eu,
    guildId: sdk.guildId,
    sdk,
    fetch: f,
    baseSala: base,
  });
}
