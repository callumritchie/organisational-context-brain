import { describe, expect, it } from 'vitest';
import { chunkText } from '@/src/modules/search/chunking';

describe('text chunking', () => {
  it('keeps short text intact with exact offsets', () => {
    expect(chunkText('Short organisational note.')).toEqual([{
      index: 0,
      startOffset: 0,
      endOffset: 26,
      text: 'Short organisational note.',
    }]);
  });

  it('creates bounded overlapping chunks that map back to the original text', () => {
    const text = Array.from({ length: 120 }, (_, index) => `Sentence ${index} contains context.`).join(' ');
    const chunks = chunkText(text, { maxCharacters: 300, overlapCharacters: 50 });
    expect(chunks.length).toBeGreaterThan(10);
    for (const [index, chunk] of chunks.entries()) {
      expect(chunk.index).toBe(index);
      expect(chunk.text).toBe(text.slice(chunk.startOffset, chunk.endOffset));
      expect(chunk.text.length).toBeLessThanOrEqual(300);
      if (index > 0) expect(chunk.startOffset).toBeLessThan(chunks[index - 1]!.endOffset);
    }
  });

  it('rejects unsafe chunking parameters', () => {
    expect(() => chunkText('text', { maxCharacters: 100 })).toThrow();
    expect(() => chunkText('text', { maxCharacters: 200, overlapCharacters: 100 })).toThrow();
  });
});
