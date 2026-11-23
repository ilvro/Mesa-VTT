import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import {
  imagensDoPacote,
  lerPacote,
  montarPacote,
  nomeDoArquivo,
  prepararImportacao,
} from '../dominio/pacote-quadro.ts';
import type { Quadro } from '../dominio/quadro.ts';
import { criarQuadroComItens, guardarImagem, lerImagem, listarItens, listarQuadros, obterQuadro } from './banco-quadros.ts';
import { campanhaAtiva } from './campanha.ts';
import { ligarItensNovos } from './ligacoes-quadro.ts';
import { carregarQuadros, descarregarPendentes, quadroAberto } from './quadros.ts';

/** Monta o `.mesa-quadro.zip` de um quadro (itens e imagens). */
export async function montarArquivoDoQuadro(quadroId: string): Promise<{ nome: string; blob: Blob }> {
  if (quadroAberto.value?.id === quadroId) await descarregarPendentes();
  const quadro = await obterQuadro(quadroId);
  if (!quadro) throw new Error('Quadro não encontrado.');
  const itens = await listarItens(quadroId);
  const arquivos: Zippable = { 'quadro.json': strToU8(montarPacote(quadro, itens)) };
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
  const bytes = arquivo instanceof Uint8Array ? arquivo : new Uint8Array(await arquivo.arrayBuffer());
  let entradas: Record<string, Uint8Array>;
  try {
    entradas = unzipSync(bytes);
  } catch {
    throw new Error('Este arquivo não é um pacote de quadro (zip inválido).');
  }
  const json = entradas['quadro.json'];
  if (!json) throw new Error('Pacote de quadro inválido: arquivo quadro.json não encontrado.');
  const pacote = lerPacote(strFromU8(json));

  let imagensFaltando = 0;
  for (const id of imagensDoPacote(pacote.itens)) {
    const dados = entradas[`imagens/${id}`];
    if (!dados) {
      imagensFaltando++;
      continue;
    }
    const tipo = (await lerImagem(id))?.tipo;
    if (tipo) continue; // já guardada (o id é o hash do conteúdo)
    await guardarImagem(new Blob([new Uint8Array(dados)], { type: tipoPorAssinatura(dados) }));
  }

  const existentes = (await listarQuadros(campanha.id)).map((q) => q.nome);
  const { quadro, itens } = prepararImportacao(pacote, {
    campanhaId: campanha.id,
    nomesExistentes: existentes,
    novoId: () => crypto.randomUUID(),
    agora: Date.now(),
  });
  await criarQuadroComItens(quadro, itens);
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
