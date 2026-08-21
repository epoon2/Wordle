#!/usr/bin/env python3
"""End-to-end test for the series score across a chain of rematches.

Two real browser sessions play three rounds, checking after every one that
both screens report the same round number and the same running score - and
that the score survives the room change a rematch makes.

Requirements: Python 3 with playwright installed, and node on PATH.
Run from the repo root:  python3 tests/e2e-series.py
"""

import asyncio
import json
import subprocess
import sys
import time
import urllib.request

from playwright.async_api import async_playwright

PORT = 8897
BASE = f"http://localhost:{PORT}"
DASH = "–"


def get_word(code):
    with urllib.request.urlopen(f"{BASE}/api/_test/word?code={code}") as response:
        return json.load(response)["word"]


async def wait_visible(page, selector, timeout=20000):
    await page.wait_for_selector(selector, state="visible", timeout=timeout)


async def type_guess(page, word):
    await page.keyboard.type(word.lower(), delay=25)
    await page.keyboard.press("Enter")


async def room_code(page):
    session = await page.evaluate("JSON.parse(sessionStorage.getItem('duelSession'))")
    return session["code"]


async def wait_for_series(page, selector, expected):
    await page.wait_for_function(
        "([sel, want]) => document.querySelector(sel).textContent.trim() === want",
        arg=[selector, expected], timeout=20000)


async def wait_for_start(page):
    await page.wait_for_function(
        "document.getElementById('countdown-overlay').style.display === 'none'",
        timeout=25000)


async def play_round(winner, loser, code, wrong):
    """Winner solves in one guess, loser needs two, so the winner takes the
    round on both points and the fewer-guesses tiebreak."""
    word = get_word(code)
    await wait_for_start(winner)
    await wait_for_start(loser)
    await type_guess(loser, wrong if wrong != word else "CRANE")
    await loser.wait_for_function(
        "['correct','present','absent'].some(c =>"
        " document.getElementById('tile-0-0').classList.contains(c))", timeout=10000)
    await type_guess(winner, word)
    await type_guess(loser, word)
    await wait_visible(winner, "#view-results")
    await wait_visible(loser, "#view-results")


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

        await alice.goto(f"{BASE}/multiplayer.html")
        await alice.click("#create-button")
        await wait_visible(alice, "#view-waiting")
        code = (await alice.text_content("#room-code")).strip()
        await bob.goto(f"{BASE}/multiplayer.html?join={code}")
        await wait_visible(bob, "#view-game")
        await wait_visible(alice, "#view-game")

        # Round 1 opens with no score to show yet
        await wait_for_series(alice, "#series-status", "Round 1")
        await wait_for_series(bob, "#series-status", "Round 1")

        # --- Round 1: Alice wins ---
        await play_round(alice, bob, code, "AUDIO")
        await wait_for_series(alice, "#series-line", f"Round 1 · You 1 {DASH} 0")
        await wait_for_series(bob, "#series-line", f"Round 1 · You 0 {DASH} 1")
        print("round 1 to alice, both results screens agree")

        # --- Round 2: the loser asks for the rematch, so the slots swap ---
        await bob.click("#rematch-button")
        await wait_visible(bob, "#view-game")
        await wait_visible(alice, "#view-game")
        round2 = await room_code(bob)
        assert round2 != code, "the rematch must be a new room"
        assert await room_code(alice) == round2

        # The inherited score is on both screens while the round is played
        await wait_for_series(bob, "#series-status", f"Round 2 · You 0 {DASH} 1")
        await wait_for_series(alice, "#series-status", f"Round 2 · You 1 {DASH} 0")
        print("round 2 in room", round2, "carries the round 1 score")

        await play_round(bob, alice, round2, "AUDIO")
        await wait_for_series(bob, "#series-line", f"Round 2 · You 1 {DASH} 1")
        await wait_for_series(alice, "#series-line", f"Round 2 · You 1 {DASH} 1")
        print("round 2 to bob, series level at 1-1 on both screens")

        # --- Round 3: the tally survives a second room change ---
        await alice.click("#rematch-button")
        await wait_visible(alice, "#view-game")
        await wait_visible(bob, "#view-game")
        round3 = await room_code(alice)
        assert round3 not in (code, round2)
        await wait_for_series(alice, "#series-status", f"Round 3 · You 1 {DASH} 1")
        await wait_for_series(bob, "#series-status", f"Round 3 · You 1 {DASH} 1")

        await play_round(alice, bob, round3, "AUDIO")
        await wait_for_series(alice, "#series-line", f"Round 3 · You 2 {DASH} 1")
        await wait_for_series(bob, "#series-line", f"Round 3 · You 1 {DASH} 2")
        print("round 3 to alice, series 2-1 on both screens")

        real_errors = [e for e in errors if "fonts.g" not in e and "ERR_CONNECTION" not in e]
        assert not real_errors, real_errors
        print("NO console errors - e2e series PASSED")

        await browser.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
