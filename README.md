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

## Setup and Running

1. Clone this repository
2. Open `index.html` in your browser to play locally
3. Alternatively, visit [deployment URL] to play online

## Development

```bash
# Clone the repository
git clone https://github.com/epoon2/Wordle.git
cd Wordle

# No build process required - open index.html directly
```

## Deployment

This game can be easily deployed to GitHub Pages:

1. In your GitHub repository, go to Settings
2. Navigate to the Pages section
3. Select the branch you want to deploy (usually `main`)
4. Select the root folder
5. Click Save

Your game will be available at `https://epoon2.github.io/Wordle/`.

## Game Rules

1. Guess the WORDLE in six tries.
2. Each guess must be a valid five-letter word.
3. After each guess, the color of the tiles will change to show how close your guess was to the word:
   - Green: The letter is in the word and in the correct spot.
   - Yellow: The letter is in the word but in the wrong spot.
   - Gray: The letter is not in the word in any spot.

## License

This project is licensed under the MIT License - see the LICENSE file for details.