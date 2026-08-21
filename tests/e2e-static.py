#!/usr/bin/env python3
"""End-to-end test for the solo game opened straight off the filesystem.

The word lists are generated and packed, so this checks the packing still
loads and works with no server at all - the double-click-index.html case,
where fetching the txt lists at runtime would be blocked.

Requirements: Python 3 with playwright installed.
Run from the repo root:  python3 tests/e2e-static.py
"""

import asyncio
import pathlib
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await (await browser.new_context()).new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        await page.goto(f"file://{ROOT}/game.html?mode=daily")
        await page.wait_for_selector("#tile-0-0", state="visible", timeout=15000)

        counts = await page.evaluate(
            "({ solutions: SOLUTION_WORDS.length, valid: ALL_VALID_WORDS.length,"
            " good: isValidWord('crane'), bad: isValidWord('zzzzz'),"
            " today: getSolutionForDate(getPacificDateString()) })")
        assert counts["solutions"] == 2308, counts
        assert counts["valid"] == 14855, counts
        assert counts["good"] and not counts["bad"], counts
        assert len(counts["today"]) == 5, counts
        print("word lists loaded from file://:", counts)

        # A rejected guess: the local list is the only validator here
        await page.keyboard.type("zzzzz", delay=20)
        await page.keyboard.press("Enter")
        await page.wait_for_function(
            "document.getElementById('message-container').textContent.includes('word list')",
            timeout=8000)
        for i in range(5):
            await page.keyboard.press("Backspace")

        # An accepted guess colors its row
        await page.keyboard.type("crane", delay=20)
        await page.keyboard.press("Enter")
        await page.wait_for_function(
            "['correct','present','absent'].some(c =>"
            " document.getElementById('tile-0-0').classList.contains(c))", timeout=8000)
        print("guess accepted and scored offline")

        real_errors = [e for e in errors if "fonts.g" not in e and "ERR_" not in e]
        assert not real_errors, real_errors
        print("NO console errors - static solo game PASSED")

        await browser.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
