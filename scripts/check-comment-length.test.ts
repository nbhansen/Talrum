import { describe, expect, it } from 'vitest';

import { findLongComments } from './check-comment-length.mjs';

const lines = (n: number, prefix: string): string =>
  Array.from({ length: n }, (_, i) => `${prefix} line ${i}`).join('\n');

describe('findLongComments', () => {
  it('accepts a line comment run at the cap', () => {
    expect(findLongComments(lines(4, '//'))).toEqual([]);
  });

  it('scans SQL-style -- runs when given that prefix', () => {
    expect(findLongComments(lines(4, '--'), { linePrefix: '--' })).toEqual([]);
    expect(findLongComments(lines(5, '--'), { linePrefix: '--' })).toEqual([
      { line: 1, length: 5 },
    ]);
    // The default prefix must not read SQL comments (a JS line can start
    // with a decrement).
    expect(findLongComments(lines(5, '--'))).toEqual([]);
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

  // A marker line that carries prose is prose. Counting only the lines between
  // the markers let a five-line `/* one … five */` pass a four-line cap.
  it('counts prose sharing a line with either marker', () => {
    expect(findLongComments('/* one\n two\n three\n four\n five */')).toEqual([
      { line: 1, length: 5 },
    ]);
    expect(findLongComments(`/**\n${lines(4, ' *')}\n * five */`)).toEqual([
      { line: 1, length: 5 },
    ]);
    expect(findLongComments('/* one\n two\n three\n four */')).toEqual([]);
  });

  it('accepts a whole comment on one line', () => {
    expect(findLongComments('/* just this */')).toEqual([]);
  });

  // Blank `//` lines do not end a run: three paragraphs joined that way are one
  // comment, and splitting them is not a way under the cap.
  it('treats a bare // separator as part of the same run', () => {
    expect(findLongComments(`${lines(3, '//')}\n//\n${lines(3, '//')}`)).toEqual([
      { line: 1, length: 7 },
    ]);
  });

  // An unterminated `/*` — reachable from a string literal like
  // `const s = '/* not a comment';` — used to walk past the last line and
  // crash the linter with a raw TypeError instead of a lint result.
  it('does not crash on a block comment that is never closed', () => {
    const inTemplate = ['const t = `', '/* looks like a comment', '`;'].join('\n');
    expect(findLongComments(inTemplate)).toEqual([]);
    // Skipped, not counted: an unclosed `/*` would otherwise swallow every
    // real comment below it in the file.
    expect(findLongComments(`/* one\n${lines(5, ' ')}`)).toEqual([]);
    expect(findLongComments(`/* x\n${lines(6, '//')}`)).toEqual([{ line: 2, length: 6 }]);
  });

  // JSX comments wrap the markers in braces, which hid a 12-line block in
  // ParentShell.tsx from the first version of this check.
  it('counts a JSX comment', () => {
    expect(findLongComments(`{/*\n${lines(5, ' ')}\n*/}`)).toEqual([{ line: 1, length: 5 }]);
    expect(findLongComments(`{/*\n${lines(4, ' ')}\n*/}`)).toEqual([]);
  });

  // Known and accepted gap: a comment that starts after code on the same line
  // is not inspected, so the run below is counted from its second line.
  // Telling these apart from a `//` inside a string needs a lexer.
  it('only inspects comments that start a line', () => {
    expect(findLongComments(`foo(); // one\n${lines(4, '//')}`)).toEqual([]);
    expect(findLongComments(`const x = f(); /* one\n${lines(4, ' *')}\n */`)).toEqual([]);
  });

  // Known and accepted gap. Joining across a truly blank line was tried and
  // reverted: two comments on adjacent declarations are two comments, and the
  // false positives cost more than the evasion this leaves open.
  it('lets a truly blank line end the run, so a split comment passes', () => {
    expect(findLongComments(`${lines(4, '//')}\n\n${lines(4, '//')}`)).toEqual([]);
  });
});
