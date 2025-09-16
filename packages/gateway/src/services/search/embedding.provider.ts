export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export class StubEmbeddingProvider implements EmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    // Deterministic pseudo-vector (length 8) for dev placeholder
    return texts.map((t) => {
      const out: number[] = new Array(8).fill(0);
      for (let i = 0; i < t.length; i++) out[i % 8] += t.charCodeAt(i) / 255;
      return out.map((n) => Number(n.toFixed(4)));
    });
  }
}

export const embeddingProvider = new StubEmbeddingProvider();
