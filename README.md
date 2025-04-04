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

The application is a static website with no build process required:

### Local Development

1. Clone this repository
   ```bash
   git clone https://github.com/epoon2/Wordle.git
   cd Wordle
   ```

2. Open `index.html` in your browser
   - Simply double-click the file, or drag the file onto your browser
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

## Deployment

This game can be easily deployed to GitHub Pages:

1. In your GitHub repository, go to Settings
2. Navigate to the Pages section
3. Select the branch you want to deploy (usually `main`)
4. Select the root folder
5. Click Save

Your game will be available at `https://epoon2.github.io/Wordle/`.

## License

This project is licensed under the MIT License - see the LICENSE file for details.