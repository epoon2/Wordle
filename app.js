document.addEventListener('DOMContentLoaded', () => {
    // Game state
    let wordOfTheDay = getRandomWord();
    let currentRow = 0;
    let currentTile = 0;
    let isGameOver = false;
    
    // Create the game board
    createBoard();
    // Set up the keyboard listeners
    setupKeyboard();
    
    // Creates the game board tiles
    function createBoard() {
        const board = document.getElementById('board');
        
        // Create 6 rows for 6 guesses
        for (let i = 0; i < 6; i++) {
            const row = document.createElement('div');
            row.classList.add('tile-row');
            
            // Create 5 tiles for 5-letter words
            for (let j = 0; j < 5; j++) {
                const tile = document.createElement('div');
                tile.classList.add('tile');
                tile.id = `tile-${i}-${j}`;
                tile.dataset.state = 'empty';
                row.appendChild(tile);
            }
            
            board.appendChild(row);
        }
    }
    
    // Set up the on-screen keyboard and physical keyboard
    function setupKeyboard() {
        // On-screen keyboard
        const keyboardButtons = document.querySelectorAll('#keyboard-container button');
        keyboardButtons.forEach(button => {
            button.addEventListener('click', () => {
                if (isGameOver) return;
                
                const key = button.dataset.key;
                handleKeyPress(key);
            });
        });
        
        // Physical keyboard
        document.addEventListener('keydown', (e) => {
            if (isGameOver) return;
            
            if (e.key === 'Enter') {
                handleKeyPress('enter');
            } else if (e.key === 'Backspace') {
                handleKeyPress('del');
            } else if (/^[a-zA-Z]$/.test(e.key)) {
                handleKeyPress(e.key.toLowerCase());
            }
        });
    }
    
    // Handle key presses
    function handleKeyPress(key) {
        if (key === 'enter') {
            submitGuess();
        } else if (key === 'del') {
            deleteLetter();
        } else if (/^[a-z]$/.test(key)) {
            addLetter(key);
        }
    }
    
    // Add a letter to the current position
    function addLetter(letter) {
        // Only add a letter if we have space in the current row
        if (currentTile < 5) {
            const tile = document.getElementById(`tile-${currentRow}-${currentTile}`);
            tile.textContent = letter.toUpperCase();
            tile.classList.add('tile-filled');
            tile.dataset.letter = letter.toUpperCase();
            currentTile++;
        }
    }
    
    // Delete the last letter
    function deleteLetter() {
        if (currentTile > 0) {
            currentTile--;
            const tile = document.getElementById(`tile-${currentRow}-${currentTile}`);
            tile.textContent = '';
            tile.classList.remove('tile-filled');
            tile.dataset.letter = '';
        }
    }
    
    // Submit the current guess
    function submitGuess() {
        // Make sure the row is complete
        if (currentTile !== 5) {
            showMessage("Not enough letters");
            return;
        }
        
        // Get the guess
        let guess = '';
        for (let i = 0; i < 5; i++) {
            const tile = document.getElementById(`tile-${currentRow}-${i}`);
            guess += tile.dataset.letter;
        }
        
        // Validate the guess is a real word
        if (!isValidWord(guess)) {
            showMessage("Not in word list");
            return;
        }
        
        // Check the guess
        checkGuess(guess);
        
        // Move to the next row
        currentRow++;
        currentTile = 0;
        
        // Check if the game is over
        if (guess === wordOfTheDay) {
            showMessage("You win!");
            isGameOver = true;
        } else if (currentRow >= 6) {
            showMessage(`Game over! The word was ${wordOfTheDay}`);
            isGameOver = true;
        }
    }
    
    // Check the guess against the word of the day
    function checkGuess(guess) {
        const wordCopy = wordOfTheDay.split('');
        const results = Array(5).fill('absent');
        
        // First pass: check for correct letters
        for (let i = 0; i < 5; i++) {
            if (guess[i] === wordOfTheDay[i]) {
                results[i] = 'correct';
                wordCopy[i] = null; // Mark as used
            }
        }
        
        // Second pass: check for present letters
        for (let i = 0; i < 5; i++) {
            if (results[i] !== 'correct') {
                const letterIndex = wordCopy.indexOf(guess[i]);
                if (letterIndex !== -1) {
                    results[i] = 'present';
                    wordCopy[letterIndex] = null; // Mark as used
                }
            }
        }
        
        // Apply the results with an animation
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                const tile = document.getElementById(`tile-${currentRow}-${i}`);
                tile.classList.add(results[i]);
                updateKeyboardKey(guess[i], results[i]);
            }, i * 250);
        }
    }
    
    // Update the keyboard key colors
    function updateKeyboardKey(letter, state) {
        const key = document.querySelector(`button[data-key="${letter.toLowerCase()}"]`);
        
        // Only update the color if the new state is "better" than the existing state
        if (key.classList.contains('correct')) {
            return; // Already correct, don't downgrade
        }
        
        if (key.classList.contains('present') && state === 'absent') {
            return; // Keep present over absent
        }
        
        // Remove existing states
        key.classList.remove('correct', 'present', 'absent');
        // Add the new state
        key.classList.add(state);
    }
    
    // Display messages to the user
    function showMessage(message) {
        const messageContainer = document.getElementById('message-container');
        messageContainer.textContent = message;
        messageContainer.style.opacity = 1;
        
        // Clear the message after 2 seconds
        setTimeout(() => {
            messageContainer.style.opacity = 0;
        }, 2000);
    }
}); 