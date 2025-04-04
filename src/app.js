document.addEventListener('DOMContentLoaded', () => {
    // Game state
    let gameMode = "daily"; // Default mode is daily challenge
    let wordOfTheDay = getDailyWord();
    let currentRow = 0;
    let currentTile = 0;
    let isGameOver = false;
    let gameStats = loadStats();
    
    // Check if today's daily challenge has been completed
    const dailyCompleted = checkDailyCompleted();
    if (dailyCompleted) {
        gameMode = "random"; // Switch to random mode if daily already completed
        wordOfTheDay = getRandomWord();
    }
    
    // Create the game board
    createBoard();
    // Set up the keyboard listeners
    setupKeyboard();
    // Set up UI button listeners
    setupButtons();
    
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
    
    // Set up button click events
    function setupButtons() {
        // Stats button
        const statsButton = document.getElementById('stats-button');
        statsButton.addEventListener('click', () => {
            displayStats();
        });
        
        // Help button
        const helpButton = document.getElementById('help-button');
        helpButton.addEventListener('click', () => {
            displayHelp();
        });
        
        // Add mode toggle button
        createModeToggle();
    }
    
    // Create a toggle button for switching between daily and random modes
    function createModeToggle() {
        // Check if the header-right already has the toggle button
        const headerRight = document.querySelector('.header-right');
        if (headerRight.querySelector('#mode-toggle')) {
            return;
        }
        
        const modeToggle = document.createElement('button');
        modeToggle.id = 'mode-toggle';
        modeToggle.classList.add('icon-button');
        modeToggle.innerHTML = gameMode === "daily" ? "📅" : "🎲";
        modeToggle.title = gameMode === "daily" ? "Daily Challenge" : "Random Play";
        
        // Add event listener to toggle game mode
        modeToggle.addEventListener('click', () => {
            if (!isGameOver) {
                // If game in progress, confirm before switching
                if (currentRow > 0) {
                    if (!confirm("Switching modes will reset your current game. Continue?")) {
                        return;
                    }
                }
            }
            
            // Toggle the game mode
            if (gameMode === "daily") {
                // Check if daily already completed
                if (checkDailyCompleted()) {
                    showMessage("You've already completed today's challenge!");
                } else {
                    // Switch to random mode
                    gameMode = "random";
                    modeToggle.innerHTML = "🎲";
                    modeToggle.title = "Random Play";
                    wordOfTheDay = getRandomWord();
                    restartGame();
                    showMessage("Switched to random play mode");
                }
            } else {
                // Check if daily already completed
                if (checkDailyCompleted()) {
                    showMessage("You've already completed today's challenge!");
                } else {
                    // Switch to daily mode
                    gameMode = "daily";
                    modeToggle.innerHTML = "📅";
                    modeToggle.title = "Daily Challenge";
                    wordOfTheDay = getDailyWord();
                    restartGame();
                    showMessage("Switched to daily challenge mode");
                }
            }
        });
        
        // Add to header
        headerRight.insertBefore(modeToggle, headerRight.firstChild);
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
        
        // Check the guess - pass the current row index for proper coloring
        checkGuess(guess, currentRow);
        
        // Check if the game is over
        if (guess.toUpperCase() === wordOfTheDay) {
            gameStats.gamesWon++;
            gameStats.currentStreak++;
            gameStats.maxStreak = Math.max(gameStats.maxStreak, gameStats.currentStreak);
            gameStats.guesses[currentRow]++;
            
            // If in daily mode, mark as completed
            if (gameMode === "daily") {
                markDailyCompleted();
            }
            
            saveStats(gameStats);
            
            setTimeout(() => {
                showMessage("You win!");
                displayStats();
            }, 1500);
            
            isGameOver = true;
        } else if (currentRow >= 5) { // Check if this is the last row (index 5)
            gameStats.currentStreak = 0;
            saveStats(gameStats);
            
            setTimeout(() => {
                showMessage(`Game over!`);
                displayStats();
            }, 1500);
            
            isGameOver = true;
        }
        
        // Move to the next row - moved after the game state check
        currentRow++;
        currentTile = 0;
    }
    
    // Check the guess against the word of the day
    function checkGuess(guess, rowIndex) {
        const wordCopy = wordOfTheDay.split('');
        const guessUpper = guess.toUpperCase();
        const results = Array(5).fill('absent');
        
        // First pass: check for correct letters
        for (let i = 0; i < 5; i++) {
            if (guessUpper[i] === wordOfTheDay[i]) {
                results[i] = 'correct';
                wordCopy[i] = null; // Mark as used
            }
        }
        
        // Second pass: check for present letters
        for (let i = 0; i < 5; i++) {
            if (results[i] !== 'correct') {
                const letterIndex = wordCopy.indexOf(guessUpper[i]);
                if (letterIndex !== -1) {
                    results[i] = 'present';
                    wordCopy[letterIndex] = null; // Mark as used
                }
            }
        }
        
        // Apply the results with an animation - use the provided row index
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                const tile = document.getElementById(`tile-${rowIndex}-${i}`);
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
    
    // Load stats from local storage
    function loadStats() {
        const stats = localStorage.getItem('wordleStats');
        if (stats) {
            return JSON.parse(stats);
        } else {
            // Default stats object
            return {
                gamesPlayed: 0,
                gamesWon: 0,
                currentStreak: 0,
                maxStreak: 0,
                guesses: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0}
            };
        }
    }
    
    // Save stats to local storage
    function saveStats(stats) {
        stats.gamesPlayed++;
        localStorage.setItem('wordleStats', JSON.stringify(stats));
    }
    
    // Display game statistics in a modal
    function displayStats() {
        // Create the stats modal if it doesn't exist
        if (!document.getElementById('stats-modal')) {
            const modal = document.createElement('div');
            modal.id = 'stats-modal';
            modal.classList.add('modal');
            
            const modalContent = document.createElement('div');
            modalContent.classList.add('modal-content');
            
            const closeBtn = document.createElement('span');
            closeBtn.classList.add('close-button');
            closeBtn.innerHTML = '&times;';
            closeBtn.onclick = function() {
                modal.style.display = 'none';
            };
            
            const header = document.createElement('h2');
            header.textContent = 'STATISTICS';
            
            const statsContainer = document.createElement('div');
            statsContainer.id = 'stats-container';
            statsContainer.classList.add('stats-container');
            
            modalContent.appendChild(closeBtn);
            modalContent.appendChild(header);
            modalContent.appendChild(statsContainer);
            modal.appendChild(modalContent);
            
            // Add event to close when clicking outside
            window.onclick = function(event) {
                if (event.target == modal) {
                    modal.style.display = 'none';
                }
            };
            
            document.body.appendChild(modal);
        }
        
        // Update stats content
        const statsContainer = document.getElementById('stats-container');
        statsContainer.innerHTML = '';
        
        // Create statistics boxes
        const boxes = [
            { label: 'Played', value: gameStats.gamesPlayed },
            { label: 'Win %', value: Math.round((gameStats.gamesWon / Math.max(1, gameStats.gamesPlayed)) * 100) },
            { label: 'Current Streak', value: gameStats.currentStreak },
            { label: 'Max Streak', value: gameStats.maxStreak }
        ];
        
        const statsBoxes = document.createElement('div');
        statsBoxes.classList.add('stats-boxes');
        
        boxes.forEach(box => {
            const statBox = document.createElement('div');
            statBox.classList.add('stat-box');
            
            const value = document.createElement('div');
            value.classList.add('stat-value');
            value.textContent = box.value;
            
            const label = document.createElement('div');
            label.classList.add('stat-label');
            label.textContent = box.label;
            
            statBox.appendChild(value);
            statBox.appendChild(label);
            statsBoxes.appendChild(statBox);
        });
        
        statsContainer.appendChild(statsBoxes);
        
        // Create guess distribution
        const guessDistribution = document.createElement('div');
        guessDistribution.classList.add('guess-distribution');
        
        const distributionHeader = document.createElement('h3');
        distributionHeader.textContent = 'GUESS DISTRIBUTION';
        guessDistribution.appendChild(distributionHeader);
        
        const maxGuesses = Math.max(...Object.values(gameStats.guesses));
        
        for (let i = 1; i <= 6; i++) {
            const row = document.createElement('div');
            row.classList.add('distribution-row');
            
            const label = document.createElement('div');
            label.classList.add('distribution-label');
            label.textContent = i;
            
            const bar = document.createElement('div');
            bar.classList.add('distribution-bar');
            
            // Calculate width percentage based on max value
            const width = maxGuesses > 0 ? (gameStats.guesses[i] / maxGuesses) * 100 : 0;
            bar.style.width = `${Math.max(7, width)}%`; // Minimum width for visibility
            
            if (i === currentRow && isGameOver && wordOfTheDay === document.getElementById(`tile-${i-1}-0`).dataset.letter + document.getElementById(`tile-${i-1}-1`).dataset.letter + document.getElementById(`tile-${i-1}-2`).dataset.letter + document.getElementById(`tile-${i-1}-3`).dataset.letter + document.getElementById(`tile-${i-1}-4`).dataset.letter) {
                bar.classList.add('current-guess');
            }
            
            const barText = document.createElement('span');
            barText.textContent = gameStats.guesses[i];
            bar.appendChild(barText);
            
            row.appendChild(label);
            row.appendChild(bar);
            guessDistribution.appendChild(row);
        }
        
        statsContainer.appendChild(guessDistribution);
        
        // Add game result and word revelation if game is over
        if (isGameOver) {
            const resultContainer = document.createElement('div');
            resultContainer.classList.add('result-container');
            
            const resultText = document.createElement('p');
            resultText.classList.add('result-text');
            if (gameStats.currentStreak > 0) {
                resultText.textContent = "You won!";
            } else {
                resultText.textContent = "Game over!";
            }
            
            const wordReveal = document.createElement('p');
            wordReveal.classList.add('word-reveal');
            wordReveal.textContent = `The word was: ${wordOfTheDay}`;
            
            const modeText = document.createElement('p');
            modeText.classList.add('mode-text');
            modeText.textContent = gameMode === "daily" ? "Daily Challenge" : "Random Play";
            
            const replayButton = document.createElement('button');
            replayButton.classList.add('replay-button');
            replayButton.textContent = 'Play Again';
            replayButton.addEventListener('click', () => {
                // If we're in daily mode and it's completed, switch to random mode
                if (gameMode === "daily" && checkDailyCompleted()) {
                    gameMode = "random";
                    const modeToggle = document.getElementById('mode-toggle');
                    if (modeToggle) {
                        modeToggle.innerHTML = "🎲";
                        modeToggle.title = "Random Play";
                    }
                }
                
                // Generate a new word based on the current mode
                if (gameMode === "daily") {
                    wordOfTheDay = getDailyWord();
                } else {
                    wordOfTheDay = getRandomWord();
                }
                
                restartGame();
                document.getElementById('stats-modal').style.display = 'none';
            });
            
            resultContainer.appendChild(resultText);
            resultContainer.appendChild(wordReveal);
            resultContainer.appendChild(modeText);
            resultContainer.appendChild(replayButton);
            
            statsContainer.appendChild(resultContainer);
        }
        
        // Show the modal
        document.getElementById('stats-modal').style.display = 'block';
    }

    // Display help information
    function displayHelp() {
        // Create the help modal if it doesn't exist
        if (!document.getElementById('help-modal')) {
            const modal = document.createElement('div');
            modal.id = 'help-modal';
            modal.classList.add('modal');
            
            const modalContent = document.createElement('div');
            modalContent.classList.add('modal-content');
            
            const closeBtn = document.createElement('span');
            closeBtn.classList.add('close-button');
            closeBtn.innerHTML = '&times;';
            closeBtn.onclick = function() {
                modal.style.display = 'none';
            };
            
            const header = document.createElement('h2');
            header.textContent = 'HOW TO PLAY';
            
            const helpContent = document.createElement('div');
            helpContent.classList.add('help-content');
            
            // Add help instructions
            helpContent.innerHTML = `
                <p>Guess the WORDLE in six tries.</p>
                <p>Each guess must be a valid five-letter word. Hit the enter button to submit.</p>
                <p>After each guess, the color of the tiles will change to show how close your guess was to the word.</p>
                <div class="examples">
                    <p><strong>Examples</strong></p>
                    <div class="example">
                        <div class="tile-row">
                            <div class="tile correct">W</div>
                            <div class="tile">E</div>
                            <div class="tile">A</div>
                            <div class="tile">R</div>
                            <div class="tile">Y</div>
                        </div>
                        <p>The letter W is in the word and in the correct spot.</p>
                    </div>
                    <div class="example">
                        <div class="tile-row">
                            <div class="tile">P</div>
                            <div class="tile present">I</div>
                            <div class="tile">L</div>
                            <div class="tile">L</div>
                            <div class="tile">S</div>
                        </div>
                        <p>The letter I is in the word but in the wrong spot.</p>
                    </div>
                    <div class="example">
                        <div class="tile-row">
                            <div class="tile">V</div>
                            <div class="tile">A</div>
                            <div class="tile">G</div>
                            <div class="tile absent">U</div>
                            <div class="tile">E</div>
                        </div>
                        <p>The letter U is not in the word in any spot.</p>
                    </div>
                </div>
            `;
            
            modalContent.appendChild(closeBtn);
            modalContent.appendChild(header);
            modalContent.appendChild(helpContent);
            modal.appendChild(modalContent);
            
            // Add event to close when clicking outside
            window.onclick = function(event) {
                if (event.target == modal) {
                    modal.style.display = 'none';
                }
            };
            
            document.body.appendChild(modal);
        }
        
        // Show the modal
        document.getElementById('help-modal').style.display = 'block';
    }

    // Get a deterministic daily word based on the current date
    function getDailyWord() {
        const now = new Date();
        const start = new Date(2022, 0, 1); // Start from Jan 1, 2022
        const msInDay = 86400000;
        const daysSinceStart = Math.floor((now - start) / msInDay);
        
        // Get a word based on the day number (ensuring it cycles through the full word list)
        const wordIndex = daysSinceStart % SOLUTION_WORDS.length;
        return SOLUTION_WORDS[wordIndex];
    }
    
    // Check if today's daily challenge has been completed
    function checkDailyCompleted() {
        const completedDailies = JSON.parse(localStorage.getItem('completedDailies') || '[]');
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        return completedDailies.includes(today);
    }
    
    // Mark today's daily challenge as completed
    function markDailyCompleted() {
        const completedDailies = JSON.parse(localStorage.getItem('completedDailies') || '[]');
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        
        if (!completedDailies.includes(today)) {
            completedDailies.push(today);
            localStorage.setItem('completedDailies', JSON.stringify(completedDailies));
        }
    }
    
    // Restart the game
    function restartGame() {
        // Reset game state
        currentRow = 0;
        currentTile = 0;
        isGameOver = false;
        
        // Clear the board
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 5; j++) {
                const tile = document.getElementById(`tile-${i}-${j}`);
                tile.textContent = '';
                tile.classList.remove('tile-filled', 'correct', 'present', 'absent');
                tile.dataset.state = 'empty';
                tile.dataset.letter = '';
            }
        }
        
        // Reset keyboard
        const keys = document.querySelectorAll('#keyboard-container button');
        keys.forEach(key => {
            key.classList.remove('correct', 'present', 'absent');
        });
        
        // Clear messages
        showMessage('');
    }
}); 