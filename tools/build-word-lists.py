#!/usr/bin/env python3
"""Regenerate both word-list modules from the txt word lists.

solution-words.txt and valid-guesses.txt are the only place word data is
edited by hand; src/words.js (browser) and netlify/functions/lib/words.mjs
(serverless functions) are generated from them and must never be edited.

Both outputs pack their words five characters at a time into one string and
split them at load time. That is roughly half the bytes of a quoted array
and still loads as a plain script from file://, so the game keeps working
offline with no build step.

Run from the repo root: python3 tools/build-word-lists.py
"""

WORDS_PER_LINE = 100


def read_list(path):
    return [w.strip().upper() for w in open(path) if len(w.strip()) == 5]


def packed(words, indent):
    """A JS expression for the word list: chunked string literals joined by
    + so the generated file stays diffable, then split back into an array."""
    chunks = [''.join(words[i:i + WORDS_PER_LINE]) for i in range(0, len(words), WORDS_PER_LINE)]
    joined = ('\n' + indent + '+ ').join(f"'{c}'" for c in chunks)
    return f"({joined}).match(/.{{5}}/g)"


def main():
    solutions = read_list('solution-words.txt')
    # valid-guesses.txt contains the solutions too; storing them once keeps
    # the generated lists free of 2308 duplicate words.
    seen = set(solutions)
    extra = []
    for word in read_list('valid-guesses.txt'):
        if word not in seen:
            seen.add(word)
            extra.append(word)

    header = (
        "// GENERATED FILE - do not edit.\n"
        "// Built from solution-words.txt and valid-guesses.txt by\n"
        "// tools/build-word-lists.py; run it again after changing either list.\n"
        f"// Solution words: {len(solutions)}\n"
        f"// Additional valid guesses: {len(extra)}\n"
        "//\n"
        "// Each list is packed five characters per word into one string and\n"
        "// split at load time, which costs about half the bytes of a quoted\n"
        "// array of the same words.\n\n"
    )

    with open('src/words.js', 'w') as f:
        f.write(header)
        f.write("// Words that can be used as solutions (official Wordle answers).\n")
        f.write("// The order is load-bearing: the daily word is an index into it.\n")
        f.write(f"const SOLUTION_WORDS = {packed(solutions, '    ')};\n\n")
        f.write("// Accepted guesses that are never the answer.\n")
        f.write(f"const ADDITIONAL_VALID_WORDS = {packed(extra, '    ')};\n\n")
        f.write("const ALL_VALID_WORDS = [...SOLUTION_WORDS, ...ADDITIONAL_VALID_WORDS];\n")
        f.write("const VALID_WORD_SET = new Set(ALL_VALID_WORDS);\n\n")
        f.write("// Get a random word from the solution list\n")
        f.write("function getRandomWord() {\n")
        f.write("    return SOLUTION_WORDS[Math.floor(Math.random() * SOLUTION_WORDS.length)];\n")
        f.write("}\n\n")
        f.write("// Check if a word is in either list of valid words\n")
        f.write("function isValidWord(word) {\n")
        f.write("    return VALID_WORD_SET.has(word.toUpperCase());\n")
        f.write("}\n")

    with open('netlify/functions/lib/words.mjs', 'w') as f:
        f.write(header)
        f.write(f"export const SOLUTION_WORDS = {packed(solutions, '    ')};\n\n")
        f.write(f"const EXTRA_VALID = {packed(extra, '    ')};\n\n")
        f.write("export const VALID_WORDS = new Set([...SOLUTION_WORDS, ...EXTRA_VALID]);\n")

    print(f"wrote src/words.js and netlify/functions/lib/words.mjs "
          f"({len(solutions)} solutions, {len(extra)} extra valid)")


if __name__ == '__main__':
    main()
