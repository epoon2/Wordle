#!/usr/bin/env python3
"""Regenerate netlify/functions/lib/words.mjs from the txt word lists.

Run from the repo root: python3 tools/build-server-words.py
"""
sol = [w.strip().upper() for w in open('solution-words.txt') if len(w.strip()) == 5]
extra = [w.strip().upper() for w in open('valid-guesses.txt') if len(w.strip()) == 5]
with open('netlify/functions/lib/words.mjs', 'w') as f:
    f.write("// Server-side word lists, generated from solution-words.txt and\n")
    f.write("// valid-guesses.txt (the same sources src/words.js is built from).\n")
    f.write("// Regenerate with: python3 tools/build-server-words.py\n\n")
    f.write("export const SOLUTION_WORDS = [\n")
    for i in range(0, len(sol), 10):
        f.write("  " + ", ".join(f"'{w}'" for w in sol[i:i+10]) + ",\n")
    f.write("];\n\n")
    f.write("const EXTRA_VALID = [\n")
    for i in range(0, len(extra), 10):
        f.write("  " + ", ".join(f"'{w}'" for w in extra[i:i+10]) + ",\n")
    f.write("];\n\n")
    f.write("export const VALID_WORDS = new Set([...SOLUTION_WORDS, ...EXTRA_VALID]);\n")
print(f"wrote words.mjs ({len(sol)} solutions, {len(extra)} extra valid)")
