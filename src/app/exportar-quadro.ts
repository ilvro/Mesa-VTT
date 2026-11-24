import { strFromU8, strToU8, zipSync, type Zippable } from 'fflate';
import {
  imagensDoPacote,
  lerPacote,
  montarPacote,
  nomeDoArquivo,
  prepararImportacao,
} from '../dominio/pacote-quadro.ts';
import type { Quadro } from '../dominio/quadro.ts';
import { criarQuadroComItens, guardarImagem, lerImagem, listarItens, listarQuadros, listarResumos, obterQuadro } from './banco-quadros.ts';
import { campanhaAtiva } from './campanha.ts';
import { ligarItensNovos } from './ligacoes-quadro.ts';
import { carregarQuadros, descarregarPendentes, quadroAberto } from './quadros.ts';
import { lerEntradaDoZip, percorrerZipEmPedacos } from './zip-streaming.ts';

/** Monta o `.mesa-quadro.zip` de um quadro (itens e imagens). */
export async function montarArquivoDoQuadro(quadroId: string): Promise<{ nome: string; blob: Blob }> {
  if (quadroAberto.value?.id === quadroId) await descarregarPendentes();
  const quadro = await obterQuadro(quadroId);
  if (!quadro) throw new Error('Quadro não encontrado.');
  const itens = await listarItens(quadroId);
  const arquivos: Zippable = { 'quadro.json': strToU8(montarPacote(quadro, itens, await listarResumos(quadroId))) };
  for (const id of imagensDoPacote(itens)) {
    const img = await lerImagem(id);
    if (!img) continue;
    arquivos[`imagens/${id}`] = [new Uint8Array(await img.blob.arrayBuffer()), { level: 0 }];
  }
  const bytes = zipSync(arquivos);
  return { nome: nomeDoArquivo(quadro.nome), blob: new Blob([new Uint8Array(bytes)], { type: 'application/zip' }) };
}

/** Baixa o quadro como arquivo (Blob + link `download`). */
export async function exportarQuadro(quadroId: string): Promise<string> {
  const { nome, blob } = await montarArquivoDoQuadro(quadroId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return nome;
}

export interface RelatorioDoPacote {
  quadro: Quadro;
  totalItens: number;
  imagensFaltando: number;
}

/** Cria um quadro novo na campanha ativa a partir de um `.mesa-quadro.zip`. */
export async function importarPacoteDeQuadro(arquivo: Blob | Uint8Array): Promise<RelatorioDoPacote> {
  const campanha = campanhaAtiva.value;
  if (!campanha) throw new Error('Escolha uma campanha antes de importar um quadro.');
  let json: Uint8Array | null;
  try {
    json = await lerEntradaDoZip(arquivo, 'quadro.json');
  } catch {
    throw new Error('Este arquivo não é um pacote de quadro (zip inválido).');
  }
  if (!json) throw new Error('Pacote de quadro inválido: arquivo quadro.json não encontrado.');
  const pacote = lerPacote(strFromU8(json));

  const esperados = new Set(imagensDoPacote(pacote.itens));
  const encontradas = new Set<string>();
  if (esperados.size > 0) {
    await percorrerZipEmPedacos(arquivo, {
      decidir: (nome) => nome.startsWith('imagens/') && esperados.has(nome.slice('imagens/'.length)),
      aoLer: async (nome, dados) => {
        const id = nome.slice('imagens/'.length);
        encontradas.add(id);
        const tipo = (await lerImagem(id))?.tipo;
        if (tipo) return; // já guardada (o id é o hash do conteúdo)
        await guardarImagem(new Blob([dados as Uint8Array<ArrayBuffer>], { type: tipoPorAssinatura(dados) }));
      },
    });
  }
  const imagensFaltando = esperados.size - encontradas.size;

  const existentes = (await listarQuadros(campanha.id)).map((q) => q.nome);
  const { quadro, itens, resumos } = prepararImportacao(pacote, {
    campanhaId: campanha.id,
    nomesExistentes: existentes,
    novoId: () => crypto.randomUUID(),
    agora: Date.now(),
  });
  await criarQuadroComItens(quadro, itens, undefined, resumos);
  await ligarItensNovos(itens);
  await carregarQuadros();
  return { quadro, totalItens: itens.length, imagensFaltando };
}

function tipoPorAssinatura(d: Uint8Array): string {
  if (d[0] === 0x89 && d[1] === 0x50) return 'image/png';
  if (d[0] === 0xff && d[1] === 0xd8) return 'image/jpeg';
  if (d[0] === 0x47 && d[1] === 0x49) return 'image/gif';
  if (d[0] === 0x52 && d[1] === 0x49) return 'image/webp';
  if (d[0] === 0x3c) return 'image/svg+xml';
  return 'application/octet-stream';
}
