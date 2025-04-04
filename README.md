# Wordle

A web-based clone of the popular word-guessing game Wordle. This project was created as part of a portfolio for computer science internship applications.

## Features

- Daily word challenges
- Keyboard input with visual feedback
- Game state persistence
- Mobile-responsive design
- Statistics tracking

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