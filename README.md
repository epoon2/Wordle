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
  boards, a points system that rewards fewer guesses and faster solves, a
  running series score across rematches, and a personal duel record

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

### Series across rematches

Hitting Rematch keeps the score going. The successor room inherits the
tally from the room it came from, so a chain of rematches reads as one
best-of series - `Round 3 · You 2 – 1` during the match and on the results
screen, on both players' screens at once.

The server owns the tally. Each round is its own room with its own player
ids, and whoever asks for the rematch hosts the next room, so the score is
kept against two sides of the series rather than the p1/p2 seats, and every
room records which seat holds which side. A round is added to the tally the
moment it is decided, which is why the results screen and the next room's
scoreboard can never disagree. A round nobody finished counts for nobody.

### Your duel record

The lobby shows the record kept for you on that device: duels played, won,
lost and drawn, win %, average guesses across the duels you solved, and
your best single-match score. It is stored in `localStorage` under
`duelStats`, so it never leaves the browser it was made in, and each match
is counted once no matter how often the results screen is reloaded.

There is deliberately no per-opponent breakdown. Duel has no accounts and
no names: every room hands both players a fresh random id, so two duels
against the same friend are indistinguishable from duels against two
strangers. A per-opponent record would have to invent an identity that does
not exist, so the record covers all opponents together instead.

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

# two-browser series: three rounds of rematches, checking both screens
# agree on the round number and the running score, and that the duel
# record on each device adds up
python3 tests/e2e-series.py

# the solo game opened straight off the filesystem, with no server
python3 tests/e2e-static.py
```

## Word lists

`solution-words.txt` (the daily answers, in a fixed order) and
`valid-guesses.txt` (everything else the game accepts) are the only word
data edited by hand. The two modules that actually load words are generated
from them and should never be edited directly:

```bash
python3 tools/build-word-lists.py   # writes src/words.js and netlify/functions/lib/words.mjs
```

Both generated files pack their words five characters at a time into one
string and split them at load time, and the guess list stores each word
once instead of repeating the 2308 solutions. That is about half the bytes
of the quoted arrays they replace, and it still loads as a plain script
from `file://`, so the game keeps working offline with no build step. A
test compares both generated lists against the txt files, and pins the
daily words for several dates so a reordering cannot slip through.

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