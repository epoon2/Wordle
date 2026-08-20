#!/usr/bin/env python3
"""End-to-end two-player duel test.

Drives two real browser sessions through a complete match: create, join,
countdown, live opponent board updates, win/loss scoring, and a rematch.

Requirements: Python 3 with playwright installed, and node on PATH.
Run from the repo root:  python3 tests/e2e-duel.py
"""

import asyncio
import json
import subprocess
import sys
import time
import urllib.request

from playwright.async_api import async_playwright

PORT = 8899
BASE = f"http://localhost:{PORT}"


def get_word(code):
    with urllib.request.urlopen(f"{BASE}/api/_test/word?code={code}") as response:
        return json.load(response)["word"]


async def wait_visible(page, selector, timeout=15000):
    await page.wait_for_selector(selector, state="visible", timeout=timeout)


async def type_guess(page, word):
    await page.keyboard.type(word.lower(), delay=30)
    await page.keyboard.press("Enter")


async def main():
    subprocess.run(["node", "tests/harness/install-shim.mjs"], check=True)
    server = subprocess.Popen(
        ["node", "tests/harness/server.mjs", str(PORT)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1.5)
    try:
        await run_test()
    finally:
        server.terminate()


async def run_test():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        errors = []

        async def make_page():
            ctx = await browser.new_context()
            page = await ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            return page

        alice = await make_page()
        bob = await make_page()

        # --- Create and join ---
        await alice.goto(f"{BASE}/multiplayer.html")
        await alice.click("#create-button")
        await wait_visible(alice, "#view-waiting")
        code = (await alice.text_content("#room-code")).strip()
        assert len(code) == 6, code
        print("room created:", code)

        await bob.goto(f"{BASE}/multiplayer.html?join={code}")
        await wait_visible(bob, "#view-game")
        await wait_visible(alice, "#view-game")
        print("both players in the countdown")

        word = get_word(code)
        assert len(word) == 5
        print("solution (via test endpoint):", word)

        # --- Wait out the 5s countdown ---
        await alice.wait_for_function(
            "document.getElementById('countdown-overlay').style.display === 'none'",
            timeout=15000)
        await bob.wait_for_function(
            "document.getElementById('countdown-overlay').style.display === 'none'",
            timeout=15000)

        # --- Bob misses once; Alice sees colors only ---
        miss = "AUDIO" if word != "AUDIO" else "CRANE"
        await type_guess(bob, miss)
        await bob.wait_for_function(
            "['correct','present','absent'].some(c => document.getElementById('tile-0-0').classList.contains(c))",
            timeout=8000)
        await alice.wait_for_function(
            "['correct','present','absent'].some(c => document.getElementById('opp-tile-0-0').classList.contains(c))",
            timeout=8000)
        own_tile_letters = await alice.evaluate(
            "Array.from(document.querySelectorAll('#opp-board .mp-mini-tile')).map(t => t.textContent).join('')")
        assert own_tile_letters == "", "opponent board must never show letters"
        print("opponent board mirrors colors, no letters")

        # --- Alice solves in 1, Bob in 2 ---
        await type_guess(alice, word)
        await alice.wait_for_function(
            "document.getElementById('tile-0-0').classList.contains('correct')", timeout=8000)
        await type_guess(bob, word)

        await wait_visible(alice, "#view-results", timeout=20000)
        await wait_visible(bob, "#view-results", timeout=20000)

        alice_banner = await alice.text_content("#result-banner")
        bob_banner = await bob.text_content("#result-banner")
        assert "win" in alice_banner.lower(), alice_banner
        assert "lose" in bob_banner.lower(), bob_banner
        assert (await alice.text_content("#result-word")).strip() == word

        totals = await alice.evaluate(
            "Array.from(document.querySelectorAll('.mp-total-row td')).slice(1).map(t => Number(t.textContent))")
        assert totals[0] > totals[1] > 0, totals
        print("results verified: alice", totals[0], "bob", totals[1])

        # --- Rematch: Bob asks, Alice follows automatically ---
        await bob.click("#rematch-button")
        await wait_visible(bob, "#view-waiting", timeout=10000)
        await wait_visible(alice, "#view-game", timeout=15000)   # auto-joined
        await wait_visible(bob, "#view-game", timeout=15000)     # poll sees the join
        new_code = None
        for page in (alice, bob):
            session = await page.evaluate("JSON.parse(sessionStorage.getItem('duelSession'))")
            assert session["code"] != code
            new_code = session["code"]
        print("rematch running in room", new_code)

        # --- No console errors (font CDN blocks aside) ---
        real_errors = [e for e in errors if "fonts.g" not in e and "ERR_CONNECTION" not in e]
        assert not real_errors, real_errors
        print("NO console errors - e2e duel PASSED")

        await browser.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
