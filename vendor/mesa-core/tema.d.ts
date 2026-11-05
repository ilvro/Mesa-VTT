/**
 * Tema compartilhado: a escolha vive em `localStorage['mesa:tema']`, na origem comum de todos os aplicativos,
 * e o evento `storage` avisa as outras abas. Os mesmos tokens CSS valem em todo aplicativo.
 */
export declare const CHAVE_TEMA = "mesa:tema";
export declare const TEMAS_BASE: readonly ['ordem', 'prata', 'neutro'];
export type TemaId = (typeof TEMAS_BASE)[number];
export type Transicao = 'glitch' | 'tinta' | 'fade';
export interface Tema {
    id: TemaId;
    /** Cor de destaque própria (#rrggbb). Sem ela, vale a do tema. */
    acento?: string;
}
interface Base {
    nome: string;
    acento: string;
    painel: string;
    titulo: string;
    transicao: Transicao;
    fundo: string;
}
export declare const TEMAS: Readonly<Record<TemaId, Base>>;
export declare const TEMA_PADRAO: Tema;
export declare const ehHex: (v: unknown) => v is string;
/** Luminância relativa (WCAG), de 0 a 1. */
export declare function luminancia(hex: string): number;
/** Texto legível sobre o destaque: branco em fundos escuros, quase preto em claros. */
export declare const textoSobre: (hex: string) => string;
export declare const escurecer: (hex: string, t: number) => string;
export type Tokens = Record<`--${string}`, string>;
/** Os tokens CSS de um tema. Puro: serve ao runtime, aos testes e a quem não tem DOM. */
export declare function tokensDoTema(tema: Tema): Tokens;
export declare function lerTema(armazenamento: Pick<Storage, 'getItem'>): Tema;
export declare function gravarTema(armazenamento: Pick<Storage, 'setItem'>, tema: Tema): void;
export interface AlvoDeTema {
    style: {
        setProperty(nome: string, valor: string): void;
    };
    dataset: Record<string, string | undefined>;
}
export declare function aplicarTema(alvo: AlvoDeTema, tema: Tema): void;
/** Chama `aoMudar` quando outra aba troca o tema. Devolve a função que cancela. */
export declare function observarTema(janela: Pick<Window, 'addEventListener' | 'removeEventListener'>, armazenamento: Pick<Storage, 'getItem'>, aoMudar: (tema: Tema) => void): () => void;
export {};
