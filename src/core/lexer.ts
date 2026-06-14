import { Token } from './types';

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const char = input[cursor];

    if (/\s/.test(char)) {
      cursor++;
      continue;
    }

    if (char === '(') {
      tokens.push({ type: 'PAREN_OPEN', value: char });
      cursor++; continue;
    }
    if (char === ')') {
      tokens.push({ type: 'PAREN_CLOSE', value: char });
      cursor++; continue;
    }
    if (char === ',') {
      tokens.push({ type: 'COMMA', value: char });
      cursor++; continue;
    }

    if (['⇒', '⇔', '¬', '∧', '∨', '∀', '∃'].includes(char)) {
      tokens.push({ type: 'OPERATOR', value: char });
      cursor++; continue;
    }

    if (/[a-zA-ZñÑáéíóúÁÉÍÓÚüÜàèìòùÀÈÌÒÙ]/.test(char)) {
      tokens.push({ type: 'IDENTIFIER', value: char });
      cursor++; continue;
    }

    throw new Error(`Carácter no reconocido en la posición ${cursor}: ${char}`);
  }

  return tokens;
}