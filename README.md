# Wordle

A web-based clone of the popular word-guessing game Wordle. This project was created as part of a portfolio for computer science internship applications.

## Features

- Daily word challenge, identical for every player, with a new word at midnight Pacific
- Full archive of previous daily Wordles, playable any time
- No replaying a finished daily - completed boards are locked and restored on revisit
- Progress saving for unfinished games (daily and archived), restored on reload
- Statistics: games played, win %, current and max daily streak, guess distribution
- Shareable emoji result grid, copied to the clipboard
- Random practice mode that never affects your stats
- Keyboard input with visual feedback, mobile-responsive design
- **Wordle Duel**: head-to-head multiplayer with room codes, live opponent
  boards, and a points system that rewards fewer guesses and faster solves

## Multiplayer (Wordle Duel)

Two players race to solve the same hidden word. Create a match to get a
6-character room code (or a shareable invite link), have a friend join, and
a synchronized countdown starts the round on both screens at once.

During the match you can watch your opponent's board fill in - colors only,
never their letters. Scoring rewards guessing well over typing fast:

- **600 points** for solving the word (0 if you fail)
- **+100 points** for every unused guess (solve in 1 = 600, in 6 = 100)
- **Speed bonus** starting at 300, dropping 1 per second, floor 0
- Ties break on fewer guesses, then the faster solve

The server is the only place the solution exists during a match. It picks
the word, validates every guess, and returns only color patterns; the word
is revealed to the clients only after both players finish. Match state
lives in Netlify Blobs, laid out so each player writes only their own data
- two simultaneous submissions can never overwrite each other.

Multiplayer requires the Netlify deployment (below). On a static host such
as GitHub Pages, the solo game works fully and the Duel lobby will report
that it cannot reach the game server.

## Deployment

The site is static plus serverless functions, configured by `netlify.toml`:

1. On [Netlify](https://app.netlify.com), choose **Add new site → Import an
   existing project** and pick this GitHub repository.
2. Accept the detected settings (no build command, publish directory `.`,
   functions in `netlify/functions`). Netlify installs `@netlify/blobs`
   from `package.json` during deploy.
3. Every push to `main` redeploys automatically.

## Development and tests

No npm install is needed locally. From the repo root:

```bash
# one-time: install the in-memory Blobs shim for local runs
node tests/harness/install-shim.mjs

# unit + API integration tests (word scoring parity, match flow,
# concurrency, forfeits, rematch)
node --test tests/game.test.mjs tests/functions.test.mjs

# local dev server: static site + multiplayer API in one process
node tests/harness/server.mjs
# then open http://localhost:8888 (two windows to play both sides)

# full two-browser end-to-end duel (requires Python + playwright)
python3 tests/e2e-duel.py
```

## How the daily word works

Every date maps to exactly one solution word. The date of Wordle #1 is a fixed
constant (`WORDLE_EPOCH` in `src/daily.js`); the word for any date is derived
from the number of days since that epoch, so every visitor on every device sees
the same word on the same day - including for past days in the archive. Days
roll over at midnight Pacific Time, and all date arithmetic is done in UTC so
daylight-saving transitions can never shift the calendar.

## Technologies Used

- HTML5
- CSS3
- JavaScript
- Local Storage for game state

## Game Rules

1. Guess the WORDLE in six tries.
2. Each guess must be a valid five-letter word.
3. After each guess, the color of the tiles will change to show how close your guess was to the word:
   - Green: The letter is in the word and in the correct spot.
   - Yellow: The letter is in the word at least once but in the wrong spot.
   - Gray: The letter is not in the word in any spot.

## How to Start the App

There are two ways to play this Wordle clone:

### Option 1: Play Online (Easiest)

Visit the deployed version at: [https://epoon2.github.io/Wordle/](https://epoon2.github.io/Wordle/)

This is the quickest way to play - no installation required!

### Option 2: Run Locally

If you prefer to run the game on your own computer:

1. Clone this repository
   ```bash
   git clone https://github.com/epoon2/Wordle.git
   cd Wordle
   ```

2. Open `index.html` in your browser
   - Simply double-click the file or drag it onto your browser
   - Or open it via browser: File > Open File
   - Or use a local server:
     ```bash
     # If you have Python installed:
     python -m http.server
     # Then open http://localhost:8000 in your browser
     
     # Or with Node.js and npx:
     npx serve
     # Then open the URL displayed in terminal
     ```

## License

This project is licensed under the MIT License - see the LICENSE file for details.