export interface TextChunk {
  index: number;
  startOffset: number;
  endOffset: number;
  text: string;
}

export interface ChunkingOptions {
  maxCharacters?: number;
  overlapCharacters?: number;
}

function boundaryBefore(text: string, start: number, target: number) {
  const minimum = start + Math.floor((target - start) * 0.6);
  for (const marker of ['\n\n', '. ', ' ']) {
    const boundary = text.lastIndexOf(marker, target);
    if (boundary >= minimum) return boundary + marker.length;
  }
  return target;
}

function boundaryAfter(text: string, target: number, maximum: number) {
  const boundary = text.indexOf(' ', target);
  return boundary !== -1 && boundary < maximum ? boundary + 1 : target;
}

export function chunkText(text: string, options: ChunkingOptions = {}): TextChunk[] {
  const maxCharacters = options.maxCharacters ?? 1_600;
  const overlapCharacters = options.overlapCharacters ?? 200;
  if (!Number.isInteger(maxCharacters) || maxCharacters < 200) {
    throw new Error('maxCharacters must be an integer of at least 200');
  }
  if (!Number.isInteger(overlapCharacters) || overlapCharacters < 0 || overlapCharacters >= maxCharacters / 2) {
    throw new Error('overlapCharacters must be a non-negative integer smaller than half the chunk size');
  }
  if (!text.length) return [];

  const chunks: TextChunk[] = [];
  let startOffset = 0;
  while (startOffset < text.length) {
    const targetEnd = Math.min(startOffset + maxCharacters, text.length);
    const endOffset = targetEnd === text.length ? text.length : boundaryBefore(text, startOffset, targetEnd);
    chunks.push({
      index: chunks.length,
      startOffset,
      endOffset,
      text: text.slice(startOffset, endOffset),
    });
    if (endOffset === text.length) break;
    const proposedStart = Math.max(0, endOffset - overlapCharacters);
    startOffset = boundaryAfter(text, proposedStart, endOffset);
    if (startOffset >= endOffset) startOffset = endOffset;
  }
  return chunks;
}
