import { describe, expect, it } from 'vitest';

import { findLongComments } from './check-comment-length.mjs';

const lines = (n: number, prefix: string): string =>
  Array.from({ length: n }, (_, i) => `${prefix} line ${i}`).join('\n');

describe('findLongComments', () => {
  it('accepts a line comment run at the cap', () => {
    expect(findLongComments(lines(4, '//'))).toEqual([]);
  });

  it('reports a line comment run over the cap', () => {
    expect(findLongComments(lines(5, '//'))).toEqual([{ line: 1, length: 5 }]);
  });

  it('counts a block comment by its content lines, not its markers', () => {
    expect(findLongComments(`/**\n${lines(4, ' *')}\n */`)).toEqual([]);
    expect(findLongComments(`/**\n${lines(5, ' *')}\n */`)).toEqual([{ line: 1, length: 5 }]);
  });

  it('does not join two runs separated by code', () => {
    expect(findLongComments(`${lines(3, '//')}\nconst a = 1;\n${lines(3, '//')}`)).toEqual([]);
  });

  it('reports the line the block starts on', () => {
    expect(findLongComments(`const a = 1;\n${lines(6, '//')}`)).toEqual([{ line: 2, length: 6 }]);
  });

  it('ignores a string that merely contains a comment marker', () => {
    expect(findLongComments(`const url = 'https://example.com';\n`)).toEqual([]);
  });
});
