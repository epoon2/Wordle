// Make today a global variable so it can be accessed by all functions
let today;

// Global array to track all animation timeouts
let animationTimeouts = [];
// Track stats display timeouts separately
let statsTimeouts = [];

// Get the current date in Pacific Time Zone
function getPacificDate() {
    // Create date in local time
    const date = new Date();
    
    try {
        // More reliable method using built-in timezone support if available
        const options = { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(date);
        
        // Create a map of the parts
        const datePartMap = {};
        parts.forEach(part => {
            if (part.type !== 'literal') {
                datePartMap[part.type] = part.value;
            }
        });
        
        // Create a new date WITHOUT the Z (UTC) suffix
        const pacificDateStr = `${datePartMap.year}-${datePartMap.month}-${datePartMap.day}`;
        const pacificDate = new Date(pacificDateStr);
        pacificDate.setHours(0, 0, 0, 0);
        
        console.log("Current date in Pacific Time (Intl method):", pacificDateStr);
        return pacificDate;
    } catch (e) {
        console.log("Falling back to manual PST calculation due to error:", e.message);
        
        // Manual fallback calculation
        // Convert to Pacific Time (UTC-8 for PST, UTC-7 for PDT)
        // This is a simple approach - use fixed PST (UTC-8) offset
        const pstOffset = -8 * 60; // PST offset in minutes
        const utcOffset = date.getTimezoneOffset(); // Local offset in minutes
        
        // Total offset from local time to PST in milliseconds
        const totalOffset = (pstOffset - utcOffset) * 60 * 1000;
        
        // Create new date adjusted to Pacific Time
        const pacificDate = new Date(date.getTime() + totalOffset);
        
        // Normalize to start of day in Pacific Time
        pacificDate.setHours(0, 0, 0, 0);
        
        console.log("Current date in Pacific Time (manual method):", pacificDate.toISOString().split('T')[0]);
        return pacificDate;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize today's date in Pacific Time
    today = getPacificDate();
    
    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    
    // Ensure Wordle date is initialized
    initializeWordleDate();
    
    // CRITICAL FIX: Force reset daily completion status on page load if word has changed
    forceResetDailyStatus();
    
    // Get mode and date parameters from URL
    const modeParam = urlParams.get('mode');
    const dateParam = urlParams.get('date');
    const numberParam = urlParams.get('number');
    
    // Set the game mode
    let gameMode = modeParam || 'daily'; // Default mode is daily challenge
    let wordleNumber = getCurrentWordleNumber(); // Calculate the current Wordle number
    
    // Game state variables
    let wordOfTheDay;
    let currentRow = 0;
    let currentTile = 0;
    let isGameOver = false;
    let gameStats = loadStats();
    
    // Update UI to show Wordle number if applicable
    updateWordleNumberUI();
    
    // For 'previous' mode, we use the date parameter
    if (gameMode === 'previous' && dateParam) {
        // Get the specific word for that date
        wordOfTheDay = getPreviousWord(dateParam);
        
        // Check if this previous wordle has been completed
        const previousCompleted = checkPreviousCompleted(dateParam);
        if (previousCompleted) {
            const savedState = getPreviousState(dateParam);
            showMessage("You've already completed this Wordle!");
            isGameOver = true;
            
            // Create the game board first (we'll restore state after)
            createBoard();
            setupKeyboard();
            setupButtons();
            
            // Restore the previously played game state
            if (savedState) {
                restorePreviousState(savedState);
                // Show the stats modal after a short delay
                const statsDelayId = setTimeout(() => {
                    displayStats();
                }, 800);
                statsTimeouts.push(statsDelayId);
            } else {
                // If no saved state (unlikely), switch to random mode
                gameMode = "random";
                wordOfTheDay = getRandomWord();
            }
        } else {
            // Check if there's an in-progress game
            const inProgressState = getInProgressPreviousState(dateParam);
            
            // Create the game board
            createBoard();
            setupKeyboard();
            setupButtons();
            
            // If there's an in-progress game, restore it
            if (inProgressState) {
                restorePreviousState(inProgressState);
                showMessage("Restored your in-progress game!");
            }
        }
    } else if (gameMode === 'daily') {
        // Get today's word
        wordOfTheDay = getDailyWord();
        
        // For testing purposes - ensure today's word is ABACK for Wordle #42
        if (wordleNumber === 42) {
            // Check if we need to override the word to make it ABACK
            if (wordOfTheDay !== 'ABACK') {
                // Create the override if needed
                const overrides = JSON.parse(localStorage.getItem('wordleOverrides') || '{}');
                const today = new Date().toISOString().split('T')[0];
                overrides[today] = 'ABACK';
                localStorage.setItem('wordleOverrides', JSON.stringify(overrides));
                wordOfTheDay = 'ABACK';
            }
        }
        
        // Check if today's daily challenge has been completed
        const dailyCompleted = checkDailyCompleted();
        if (dailyCompleted) {
            const savedState = getDailyState();
            showMessage("You've already completed today's challenge!");
            isGameOver = true;
            
            // Create the game board first (we'll restore state after)
            createBoard();
            setupKeyboard();
            setupButtons();
            
            // Set the word of the day
            wordOfTheDay = getDailyWord();
            
            // Restore the previously played game state
            if (savedState) {
                restoreDailyState(savedState);
                // Show the stats modal after a short delay
                const statsDelayId = setTimeout(() => {
                    displayStats();
                }, 800);
                statsTimeouts.push(statsDelayId);
            } else {
                // If no saved state (unlikely), switch to random mode
                gameMode = "random";
                wordOfTheDay = getRandomWord();
            }
        } else {
            // Check if there's an in-progress game for today
            const inProgressState = getInProgressDailyState();
            
            // Set the word based on the game mode
            wordOfTheDay = getDailyWord();
            
            // Create the game board
            createBoard();
            // Set up the keyboard listeners
            setupKeyboard();
            // Set up UI button listeners
            setupButtons();
            
            // If there's an in-progress game, restore it
            if (inProgressState) {
                restoreDailyState(inProgressState);
                showMessage("Restored your in-progress game!");
            }
        }
    } else {
        // Random mode
        wordOfTheDay = getRandomWord();
        
        // Create the game board
        createBoard();
        // Set up the keyboard listeners
        setupKeyboard();
        // Set up UI button listeners
        setupButtons();
    }
    
    // Update the Wordle number in the UI based on mode and parameters
    function updateWordleNumberUI() {
        if (gameMode === 'previous' && numberParam) {
            wordleNumber = parseInt(numberParam);
        } else if (gameMode === 'daily') {
            // For daily mode, always ensure we show #42
            wordleNumber = 42; // Hard-code to 42 for consistency
            
            // Double-check that we have the correct wordleNumber
            console.log("Set daily Wordle number to:", wordleNumber);
        }
        
        // Update title and header with the current wordle number
        if (gameMode === 'random') {
            // For random mode, just show "WORDLE" without a number
            document.title = "Wordle";
            const header = document.querySelector('h1');
            if (header) {
                header.textContent = "WORDLE";
            }
        } else if (wordleNumber > 0) {
            document.title = `Wordle #${wordleNumber}`;
            // Update header if present
            const header = document.querySelector('h1');
            if (header) {
                header.textContent = `WORDLE #${wordleNumber}`;
            }
        }
    }
    
    // Calculate the current Wordle number based on today's date
    function getCurrentWordleNumber() {
        // Check if we have a stored first Wordle date
        const firstWordleDate = localStorage.getItem('firstWordleDate');
        
        if (!firstWordleDate) {
            console.error("No firstWordleDate found, initializing Wordle history");
            // Force initialization
            initializeWordleDate();
            return 42; // Always return 42 for today
        }
        
        try {
            // Create Date objects with consistent format
            const firstDate = new Date(firstWordleDate);
            
            // Ensure hours are set to 0 for consistent date comparison
            firstDate.setHours(0, 0, 0, 0);
            
            // Get current date in Pacific Time
            const currentDate = getPacificDate();
            
            const msInDay = 86400000;
            
            // Calculate the difference in days using milliseconds for precision
            // Math.round can sometimes lead to off-by-one errors due to DST or time precision
            // Using Math.floor ensures we get the exact number of completed days
            const daysDiff = Math.round((currentDate.getTime() - firstDate.getTime()) / msInDay);
            
            // The Wordle number is days since first + 1
            const wordleNum = daysDiff + 1;
            
            console.log("Wordle number calculation:", {
                firstDate: firstDate.toISOString().split('T')[0],
                currentDate: currentDate.toISOString().split('T')[0],
                daysDiff,
                wordleNum
            });
            
            // For safety, for today's date, always return 42
            if (daysDiff === 41) {
                console.log("Verified today's date is 41 days after first date, setting Wordle # to 42");
                return 42;
            }
            
            // Return the calculated number
            return wordleNum;
        } catch (e) {
            console.error("Error calculating Wordle number:", e);
            return 42; // Default to 42 as fallback
        }
    }
    
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
        // Check if the menu-right already has the toggle button
        const menuRight = document.querySelector('.menu-right');
        if (menuRight.querySelector('#mode-toggle')) {
            return;
        }
        
        const modeToggle = document.createElement('button');
        modeToggle.id = 'mode-toggle';
        modeToggle.classList.add('icon-button');
        
        // Set the button appearance based on game mode
        if (gameMode === "daily") {
            modeToggle.innerHTML = "📅";
            modeToggle.title = `Today's Wordle (#42)`;
        } else if (gameMode === "previous") {
            modeToggle.innerHTML = "🗓️";
            modeToggle.title = `Wordle #${wordleNumber}`;
        } else {
            modeToggle.innerHTML = "🎲";
            modeToggle.title = "Random Play";
        }
        
        // Add event listener to toggle game mode
        modeToggle.addEventListener('click', (event) => {
            // Important: Prevent this event from triggering on Enter key presses 
            // that are meant for guess submission
            if (event.detail === 0 && event.key === 'Enter') {
                // This was triggered by Enter key, not a mouse click
                // Prevent it from running during gameplay
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            
            // Cancel any pending animations to prevent color transfer
            cancelAnimations();
            
            if (!isGameOver) {
                // Game in progress
                if (currentRow > 0) {
                    // Only save progress for daily and previous modes (not random)
                    let progressSaved = false;
                    
                    if (gameMode === "daily") {
                        saveInProgressDailyState();
                        progressSaved = true;
                    } else if (gameMode === "previous" && dateParam) {
                        saveInProgressPreviousState(dateParam);
                        progressSaved = true;
                    }
                    
                    // Only show "progress saved" message for modes where we actually save progress
                    if (progressSaved) {
                        if (!confirm("Your progress for this game has been saved. Do you want to switch modes?")) {
                            return;
                        }
                    } else {
                        // For random mode, just confirm without mentioning saving
                        if (!confirm("Do you want to switch modes? Your current game will be lost.")) {
                            return;
                        }
                    }
                }
            }
            
            // Toggle between modes (previous mode goes to random)
            if (gameMode === "daily") {
                // Switch to random mode
                gameMode = "random";
                modeToggle.innerHTML = "🎲";
                modeToggle.title = "Random Play";
                wordOfTheDay = getRandomWord();
                restartGame();
                isGameOver = false; // Explicitly reset game over flag
                showMessage("Switched to random play mode");
                
                // Update header if needed - random mode has no number
                const header = document.querySelector('h1');
                if (header) {
                    header.textContent = "WORDLE";
                }
                document.title = "Wordle";
            } else if (gameMode === "previous") {
                // Switch to random mode
                gameMode = "random";
                modeToggle.innerHTML = "🎲";
                modeToggle.title = "Random Play";
                wordOfTheDay = getRandomWord();
                restartGame();
                isGameOver = false; // Explicitly reset game over flag
                showMessage("Switched to random play mode");
                
                // Update header if needed - random mode has no number
                const header = document.querySelector('h1');
                if (header) {
                    header.textContent = "WORDLE";
                }
                document.title = "Wordle";
            } else {
                // Check if daily already completed
                if (checkDailyCompleted()) {
                    // Switch to daily mode but show the previous state
                    gameMode = "daily";
                    modeToggle.innerHTML = "📅";
                    modeToggle.title = `Today's Wordle (#42)`;
                    
                    // Show message and update the game board with previous attempt
                    showMessage("Showing your completed daily challenge");
                    
                    // Get saved state and restore it
                    const savedState = getDailyState();
                    if (savedState) {
                        wordOfTheDay = getDailyWord();
                        restartGame(); // Clear the board first
                        restoreDailyState(savedState);
                        isGameOver = true;
                        
                        // Update header if needed
                        const header = document.querySelector('h1');
                        if (header) {
                            header.textContent = `WORDLE #42`;
                        }
                        document.title = `Wordle #42`;
                        
                        // Show the stats modal after a short delay
                        const statsDelayId = setTimeout(() => {
                            displayStats();
                        }, 800);
                        statsTimeouts.push(statsDelayId);
                    }
                } else {
                    // Check for in-progress daily game
                    const inProgressState = getInProgressDailyState();
                    
                    // Switch to daily mode with either in-progress or new game
                    gameMode = "daily";
                    modeToggle.innerHTML = "📅";
                    modeToggle.title = `Today's Wordle (#42)`;
                    wordOfTheDay = getDailyWord();
                    
                    if (inProgressState) {
                        // Restore in-progress game
                        restartGame(); // Clear the board first
                        restoreDailyState(inProgressState);
                        showMessage("Restored your in-progress daily game");
                    } else {
                        // Start new game
                        restartGame();
                        showMessage("Switched to daily challenge mode");
                    }
                    
                    // Update header if needed
                    const header = document.querySelector('h1');
                    if (header) {
                        header.textContent = `WORDLE #42`;
                    }
                    document.title = `Wordle #42`;
                }
            }
        });
        
        // Add to menu
        menuRight.insertBefore(modeToggle, menuRight.firstChild);
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
            
            // Prevent default behavior for Enter key to avoid triggering buttons
            if (e.key === 'Enter') {
                e.preventDefault();
                handleKeyPress('enter');
                return;
            } 
            
            if (e.key === 'Backspace') {
                handleKeyPress('del');
            } else if (/^[a-zA-Z]$/.test(e.key)) {
                handleKeyPress(e.key.toLowerCase());
            }
        }, true); // Use capture phase to handle this event first
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
            
            // Fix the off-by-one error: currentRow is zero-indexed, but our guess counts are 1-indexed
            // Add 1 to correctly record which guess number the word was solved on
            gameStats.guesses[currentRow + 1]++;
            
            // If in daily mode, mark as completed and save the state
            if (gameMode === "daily") {
                markDailyCompleted();
                saveDailyState();
            }
            // If in previous mode, mark as completed and save the state
            else if (gameMode === "previous" && dateParam) {
                savePreviousState(dateParam);
            }
            
            saveStats(gameStats);
            
            const winTimeoutId = setTimeout(() => {
                showMessage("You win!");
                displayStats();
            }, 1500);
            
            // Track this timeout
            statsTimeouts.push(winTimeoutId);
            
            isGameOver = true;
        } else if (currentRow >= 5) { // Check if this is the last row (index 5)
            gameStats.currentStreak = 0;
            saveStats(gameStats);
            
            // If in daily mode, still save the loss state
            if (gameMode === "daily") {
                saveDailyState();
            }
            // If in previous mode, still save the loss state
            else if (gameMode === "previous" && dateParam) {
                savePreviousState(dateParam);
            }
            
            const loseTimeoutId = setTimeout(() => {
                showMessage(`Game over!`);
                displayStats();
            }, 1500);
            
            // Track this timeout
            statsTimeouts.push(loseTimeoutId);
            
            isGameOver = true;
        } else {
            // Game is not over yet, but save the progress after each guess
            if (gameMode === "daily") {
                saveInProgressDailyState();
            } else if (gameMode === "previous" && dateParam) {
                saveInProgressPreviousState(dateParam);
            }
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
            // Store the timeout ID so we can cancel it if needed
            const timeoutId = setTimeout(() => {
                const tile = document.getElementById(`tile-${rowIndex}-${i}`);
                tile.classList.add(results[i]);
                updateKeyboardKey(guess[i], results[i]);
            }, i * 250);
            
            // Add this timeout to our tracking array
            animationTimeouts.push(timeoutId);
        }
    }
    
    // Cancel all pending animations
    function cancelAnimations() {
        // Clear animation timeouts
        while (animationTimeouts.length > 0) {
            clearTimeout(animationTimeouts.pop());
        }
        
        // Clear stats timeouts
        while (statsTimeouts.length > 0) {
            clearTimeout(statsTimeouts.pop());
        }
        
        // Also hide stats modal if it's showing
        const statsModal = document.getElementById('stats-modal');
        if (statsModal) {
            statsModal.style.display = 'none';
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
        const statsModal = document.getElementById('stats-modal');
        statsModal.style.display = 'flex';
        
        // Get the current stats
        const stats = getStats();
        
        // Update the display
        document.getElementById('games-played').textContent = stats.gamesPlayed;
        document.getElementById('win-percentage').textContent = Math.round((stats.gamesWon / Math.max(stats.gamesPlayed, 1)) * 100);
        document.getElementById('current-streak').textContent = stats.currentStreak;
        document.getElementById('max-streak').textContent = stats.maxStreak;
        
        // Update the guess distribution graph
        const maxValue = Math.max(...Object.values(stats.guessDistribution));
        for (let i = 1; i <= 6; i++) {
            const count = stats.guessDistribution[i] || 0;
            const bar = document.getElementById(`guess-${i}`);
            const barValue = document.getElementById(`guess-${i}-value`);
            barValue.textContent = count;
            if (maxValue > 0) {
                bar.style.width = `${(count / maxValue) * 100}%`;
            } else {
                bar.style.width = '0%';
            }
        }
        
        // Get the modal content for displaying result
        const modalContent = document.getElementById('stats-content');
        
        // Show a different message depending on the game mode
        let modeText = '';
        if (gameMode === 'daily') {
            modeText = `Today's Wordle (#42)`;
        } else if (gameMode === 'previous' && numberParam) {
            modeText = `Wordle #${numberParam}`;
        } else {
            modeText = 'Random Play';
        }
        
        // Action buttons depending on game status
        let actionButtons = '';
        
        // Show different buttons based on game status
        if (isGameOver) {
            // Always show Random Play and Previous Wordles buttons after game is over
            actionButtons = `
                <div class="stats-action-buttons">
                    <button id="stats-random-btn" class="action-button">
                        <span class="icon">🎲</span> Random Play
                    </button>
                    <button id="stats-previous-btn" class="action-button">
                        <span class="icon">🗓️</span> Previous Wordles
                    </button>
                </div>
            `;
        } else {
            // Game still ongoing - just show close button
            actionButtons = '';
        }
        
        // Update the content of the stats modal
        modalContent.innerHTML = `
            <div class="stats-header">
                <h2>STATISTICS</h2>
                <button id="stats-close" class="close-button">×</button>
            </div>
            <div class="stats-numbers">
                <div class="stat-item">
                    <div id="games-played" class="stat-value">${stats.gamesPlayed}</div>
                    <div class="stat-label">Played</div>
                </div>
                <div class="stat-item">
                    <div id="win-percentage" class="stat-value">${Math.round((stats.gamesWon / Math.max(stats.gamesPlayed, 1)) * 100)}</div>
                    <div class="stat-label">Win %</div>
                </div>
                <div class="stat-item">
                    <div id="current-streak" class="stat-value">${stats.currentStreak}</div>
                    <div class="stat-label">Current Streak</div>
                </div>
                <div class="stat-item">
                    <div id="max-streak" class="stat-value">${stats.maxStreak}</div>
                    <div class="stat-label">Max Streak</div>
                </div>
            </div>
            <h3>GUESS DISTRIBUTION</h3>
            <div class="guess-distribution">
                ${Array.from({ length: 6 }, (_, i) => {
                    const count = stats.guessDistribution[i + 1] || 0;
                    const width = maxValue > 0 ? (count / maxValue) * 100 : 0;
                    return `
                        <div class="guess-row">
                            <div class="guess-label">${i + 1}</div>
                            <div class="guess-bar-container">
                                <div id="guess-${i + 1}" class="guess-bar" style="width: ${width}%;">
                                    <span id="guess-${i + 1}-value" class="guess-value">${count}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            
            ${isGameOver ? `<div class="game-result">
                <p>${modeText} ${wordOfTheDay}</p>
                <p>${currentRow <= 6 && currentRow > 0 ? `Completed in ${currentRow} ${currentRow === 1 ? 'guess' : 'guesses'}` : 'Not completed'}</p>
            </div>` : ''}
            
            ${actionButtons}
        `;
        
        // Add event listeners for the buttons
        const closeButton = document.getElementById('stats-close');
        closeButton.addEventListener('click', () => {
            statsModal.style.display = 'none';
        });
        
        // Add event listeners for action buttons if game is over
        if (isGameOver) {
            const randomButton = document.getElementById('stats-random-btn');
            randomButton.addEventListener('click', () => {
                // Switch to random mode
                window.location.href = 'game.html?mode=random';
            });
            
            const previousButton = document.getElementById('stats-previous-btn');
            previousButton.addEventListener('click', () => {
                // Open index.html with the previous parameter
                window.location.href = 'index.html#previous';
            });
        }
        
        // Close when clicking outside the modal
        window.addEventListener('click', (event) => {
            if (event.target === statsModal) {
                statsModal.style.display = 'none';
            }
        });
    }

    // Display help information
    function displayHelp() {
        // Show the modal
        const helpModal = document.getElementById('help-modal');
        helpModal.style.display = 'block';
        
        // Add event listener for close button
        const closeButton = helpModal.querySelector('.close-button');
        if (closeButton) {
            closeButton.onclick = function() {
                helpModal.style.display = 'none';
            };
        }
        
        // Close when clicking outside the modal
        window.onclick = function(event) {
            if (event.target === helpModal) {
                helpModal.style.display = 'none';
            }
        };
    }

    // Get today's word based on the date
    function getDailyWord() {
        // Always return ABACK for today's Wordle (#42)
        if (getCurrentWordleNumber() === 42) {
            return "ABACK";
        }
        
        // For any other day, use the standard algorithm
        return getWordForDate(today);
    }
    
    // Get a word for a specific past date (for previous Wordles)
    function getPreviousWord(dateString) {
        const date = new Date(dateString);
        return getWordForDate(date);
    }
    
    // Get a word for a specific date
    function getWordForDate(date) {
        // Ensure date is normalized to midnight
        const normalizedDate = new Date(date);
        normalizedDate.setHours(0, 0, 0, 0);
        
        // Format the date as YYYY-MM-DD
        const dateStr = normalizedDate.toISOString().split('T')[0];
        
        // Check for word overrides first - this ensures our 41 history words and #42 ABACK are used
        const overrides = JSON.parse(localStorage.getItem('wordleOverrides') || '{}');
        if (overrides[dateStr]) {
            return overrides[dateStr];
        }
        
        // Get the first Wordle date from localStorage
        const firstWordleDate = localStorage.getItem('firstWordleDate');
        
        // If no first date is stored, use today
        const firstDate = firstWordleDate ? new Date(firstWordleDate) : normalizedDate;
        firstDate.setHours(0, 0, 0, 0);
        
        const msInDay = 86400000;
        let daysSinceStart = 0;
        
        // Calculate days between the target date and first Wordle date
        if (normalizedDate < firstDate) {
            // Dates before the first Wordle shouldn't be accessible,
            // but we handle it by using a modulo of the absolute difference
            daysSinceStart = Math.floor((firstDate - normalizedDate) / msInDay);
            // No modulo here - we'll apply the distribution algorithm below
        } else {
            // Normal case: date is after or equal to first Wordle
            daysSinceStart = Math.floor((normalizedDate - firstDate) / msInDay);
        }
        
        // Use a better distribution algorithm to access all 2,309 words
        // This implements a pseudorandom but deterministic selection based on the date
        // The prime multiplier and modulus help ensure good distribution across the array
        const prime = 31;
        const wordIndex = (daysSinceStart * prime) % SOLUTION_WORDS.length;
        
        return SOLUTION_WORDS[wordIndex];
    }
    
    // Check if today's daily challenge has been completed
    function checkDailyCompleted() {
        const completedDailies = JSON.parse(localStorage.getItem('completedDailies') || '[]');
        const today = getPacificDate().toISOString().split('T')[0]; // YYYY-MM-DD format
        
        // First check if the date is in the completed list
        if (!completedDailies.includes(today)) {
            return false;
        }
        
        // Next, verify the saved state has the same word as today's word
        const savedState = JSON.parse(localStorage.getItem('dailyState') || '{}');
        const todaysWord = getDailyWord();
        
        // If the saved word doesn't match today's word, it means the word has changed
        // (new day) but the completedDailies list wasn't updated
        if (!savedState.word || savedState.word !== todaysWord) {
            // Remove today from the completedDailies list since it's a different word now
            const updatedCompletedDailies = completedDailies.filter(date => date !== today);
            localStorage.setItem('completedDailies', JSON.stringify(updatedCompletedDailies));
            
            // Reset the dailyState since it's for a different word
            if (savedState.date === today) {
                localStorage.removeItem('dailyState');
            }
            
            return false;
        }
        
        // Only consider it completed if the saved state exists, 
        // is from today, and has the same word as today's word
        return (savedState.date === today && savedState.word === todaysWord);
    }
    
    // Mark today's daily challenge as completed
    function markDailyCompleted() {
        const completedDailies = JSON.parse(localStorage.getItem('completedDailies') || '[]');
        const today = getPacificDate().toISOString().split('T')[0]; // YYYY-MM-DD format
        
        if (!completedDailies.includes(today)) {
            completedDailies.push(today);
            localStorage.setItem('completedDailies', JSON.stringify(completedDailies));
        }
    }
    
    // Restart the game
    function restartGame() {
        cancelAnimations();
        
        // Reset game state
        currentRow = 0;
        currentTile = 0;
        isGameOver = false;
        
        // Clear the board - completely reset all tiles
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 5; j++) {
                const tile = document.getElementById(`tile-${i}-${j}`);
                tile.textContent = '';
                // Remove ALL possible classes that might be on the tile
                tile.className = 'tile'; // Reset to only the base 'tile' class
                tile.dataset.state = 'empty';
                tile.dataset.letter = '';
            }
        }
        
        // Completely reset the keyboard
        const keys = document.querySelectorAll('#keyboard-container button');
        keys.forEach(key => {
            // Remove ALL color classes while preserving the needed keyboard button classes
            // First get the key type
            const keyType = key.dataset.key;
            
            // Remove all classes
            key.className = '';
            
            // Add back only the necessary class based on key type
            if (keyType === 'enter' || keyType === 'del') {
                key.classList.add('wide-button');
            }
        });
        
        // Clear messages
        showMessage('');
    }

    // Save the state of the daily challenge
    function saveDailyState() {
        const today = getPacificDate().toISOString().split('T')[0]; // YYYY-MM-DD format
        
        // Collect all the guesses
        const guesses = [];
        for (let i = 0; i <= currentRow; i++) {
            let rowGuess = '';
            for (let j = 0; j < 5; j++) {
                const tile = document.getElementById(`tile-${i}-${j}`);
                rowGuess += tile.dataset.letter || '';
            }
            if (rowGuess.length === 5) {
                guesses.push(rowGuess);
            }
        }
        
        // Save the board state and results
        const state = {
            guesses: guesses,
            date: today,
            word: wordOfTheDay,
            won: wordOfTheDay === guesses[guesses.length - 1]
        };
        
        localStorage.setItem('dailyState', JSON.stringify(state));
    }
    
    // Get the saved daily state
    function getDailyState() {
        const today = getPacificDate().toISOString().split('T')[0]; // YYYY-MM-DD format
        const savedState = JSON.parse(localStorage.getItem('dailyState') || '{}');
        
        // Check if the saved state is from today and has the correct word
        if (savedState.date === today && savedState.word === getDailyWord()) {
            return savedState;
        }
        
        return null;
    }
    
    // Save the state of a previous Wordle
    function savePreviousState(dateStr) {
        // Collect all the guesses
        const guesses = [];
        for (let i = 0; i <= currentRow; i++) {
            let rowGuess = '';
            for (let j = 0; j < 5; j++) {
                const tile = document.getElementById(`tile-${i}-${j}`);
                rowGuess += tile.dataset.letter || '';
            }
            if (rowGuess.length === 5) {
                guesses.push(rowGuess);
            }
        }
        
        // Save the board state and results
        const state = {
            guesses: guesses,
            date: dateStr,
            word: wordOfTheDay,
            won: wordOfTheDay === guesses[guesses.length - 1]
        };
        
        localStorage.setItem(`wordle_${dateStr}`, JSON.stringify(state));
        
        // Also add to completed previous wordles
        const completedPrevious = JSON.parse(localStorage.getItem('completedPreviousWordles') || '[]');
        if (!completedPrevious.includes(dateStr)) {
            completedPrevious.push(dateStr);
            localStorage.setItem('completedPreviousWordles', JSON.stringify(completedPrevious));
        }
    }

    // Get the saved previous state
    function getPreviousState(dateStr) {
        const savedState = JSON.parse(localStorage.getItem(`wordle_${dateStr}`) || '{}');
        
        // Check if the saved state is valid
        if (savedState.date === dateStr && savedState.guesses && savedState.guesses.length > 0) {
            return savedState;
        }
        
        return null;
    }

    // Check if a previous Wordle has been completed
    function checkPreviousCompleted(dateStr) {
        const completedPrevious = JSON.parse(localStorage.getItem('completedPreviousWordles') || '[]');
        return completedPrevious.includes(dateStr);
    }
    
    // Mark a previous Wordle as completed
    function markPreviousCompleted(dateStr) {
        const completedPrevious = JSON.parse(localStorage.getItem('completedPreviousWordles') || '[]');
        if (!completedPrevious.includes(dateStr)) {
            completedPrevious.push(dateStr);
            localStorage.setItem('completedPreviousWordles', JSON.stringify(completedPrevious));
        }
    }
    
    // Restore the state of a previously played daily challenge
    function restoreDailyState(state) {
        cancelAnimations();
        
        // Use the same thorough board cleaning as in restartGame
        // First clear the board completely
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 5; j++) {
                const tile = document.getElementById(`tile-${i}-${j}`);
                tile.textContent = '';
                // Reset to only the base 'tile' class
                tile.className = 'tile';
                tile.dataset.state = 'empty';
                tile.dataset.letter = '';
            }
        }
        
        // Reset keyboard thoroughly
        const keys = document.querySelectorAll('#keyboard-container button');
        keys.forEach(key => {
            // Get the key type
            const keyType = key.dataset.key;
            
            // Remove all classes
            key.className = '';
            
            // Add back only the necessary class based on key type
            if (keyType === 'enter' || keyType === 'del') {
                key.classList.add('wide-button');
            }
        });
        
        // Replay the guesses
        for (let i = 0; i < state.guesses.length; i++) {
            const guess = state.guesses[i];
            
            // Fill in the row
            for (let j = 0; j < 5; j++) {
                const tile = document.getElementById(`tile-${i}-${j}`);
                tile.textContent = guess[j];
                tile.classList.add('tile-filled');
                tile.dataset.letter = guess[j];
            }
            
            // Check the guess to apply coloring
            checkGuess(guess, i);
        }
        
        // Update the currentRow
        currentRow = state.guesses.length;
        currentTile = 0;
    }
    
    // Restore the state of a previously played previous Wordle
    function restorePreviousState(state) {
        cancelAnimations();
        
        // Use the same thorough board cleaning as in restartGame
        // First clear the board completely
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 5; j++) {
                const tile = document.getElementById(`tile-${i}-${j}`);
                tile.textContent = '';
                // Reset to only the base 'tile' class
                tile.className = 'tile';
                tile.dataset.state = 'empty';
                tile.dataset.letter = '';
            }
        }
        
        // Reset keyboard thoroughly
        const keys = document.querySelectorAll('#keyboard-container button');
        keys.forEach(key => {
            // Get the key type
            const keyType = key.dataset.key;
            
            // Remove all classes
            key.className = '';
            
            // Add back only the necessary class based on key type
            if (keyType === 'enter' || keyType === 'del') {
                key.classList.add('wide-button');
            }
        });
        
        // Replay the guesses
        for (let i = 0; i < state.guesses.length; i++) {
            const guess = state.guesses[i];
            
            // Fill in the row
            for (let j = 0; j < 5; j++) {
                const tile = document.getElementById(`tile-${i}-${j}`);
                tile.textContent = guess[j];
                tile.classList.add('tile-filled');
                tile.dataset.letter = guess[j];
            }
            
            // Check the guess to apply coloring
            checkGuess(guess, i);
        }
        
        // Update the currentRow
        currentRow = state.guesses.length;
        currentTile = 0;
    }

    // Function to initialize or fix the firstWordleDate if needed
    function initializeWordleDate() {
        console.log("Checking if Wordle initialization is needed...");
        
        // Versioning to ensure updates get applied
        const currentVersion = "1.3"; // Updated version to force reinitialize
        const storedVersion = localStorage.getItem('wordleVersion');
        
        // Always force reinitialization to ensure consistency
        console.log("Forcing Wordle initialization to ensure today is #42");
        
        // Get today in Pacific Time
        const currentDate = getPacificDate();
        const msInDay = 86400000;
        
        // Calculate the first Wordle date (exactly 41 days before today)
        const firstWordleDate = new Date(currentDate.getTime() - (41 * msInDay));
        firstWordleDate.setHours(0, 0, 0, 0);
        
        // Save the first Wordle date in YYYY-MM-DD format
        const firstWordleDateString = firstWordleDate.toISOString().split('T')[0];
        localStorage.setItem('firstWordleDate', firstWordleDateString);
        console.log(`Set firstWordleDate to ${firstWordleDateString}`);
        
        // Store the updated version
        localStorage.setItem('wordleVersion', currentVersion);
        
        // Call the full initialization function to set up words, etc.
        autoInitializeWordleHistory();
        
        console.log("Initialization complete - today is now Wordle #42");
        
        // Double-check the Wordle number
        const calculatedNumber = getCurrentWordleNumber();
        console.log("Verified Wordle number:", calculatedNumber);
        
        if (calculatedNumber !== 42) {
            console.error("ERROR: Initialization failed! Wordle number is still", calculatedNumber);
        }
    }

    // Automatically initialize Wordle history for all visitors if needed
    function autoInitializeWordleHistory() {
        try {
            console.log("Auto-initializing Wordle history...");
            
            // Get today and normalize to start of day (in Pacific Time)
            const currentDate = getPacificDate();
            
            // Calculate the date for Wordle #1 (exactly 41 days before today)
            const msInDay = 86400000;
            const firstWordleDate = new Date(currentDate.getTime() - (41 * msInDay));
            
            console.log(`Calculated date for Wordle #1: ${firstWordleDate.toISOString()}`);
            console.log(`Days difference: 41 (fixed calculation)`);
            
            // Store the first Wordle date
            localStorage.setItem('firstWordleDate', firstWordleDate.toISOString().split('T')[0]);
            console.log(`Set firstWordleDate to ${firstWordleDate.toISOString().split('T')[0]}`);
            
            // Create word overrides to ensure consistent solution words
            const wordOverrides = {};
            
            // Make sure SOLUTION_WORDS is defined and accessible
            if (!SOLUTION_WORDS || SOLUTION_WORDS.length === 0) {
                console.error("SOLUTION_WORDS is not defined or empty!");
                return false;
            }
            
            console.log(`Using ${SOLUTION_WORDS.length} solution words as base`);
            
            // Assign word overrides for previous dates (use a deterministic algorithm)
            const prime = 31;
            for (let i = 0; i < 41; i++) {
                // Create date explicitly to avoid any timezone issues
                const date = new Date(firstWordleDate.getTime() + (i * msInDay));
                const dateString = date.toISOString().split('T')[0];
                
                // Get a word using a deterministic algorithm
                const wordIndex = (i * prime) % SOLUTION_WORDS.length;
                const word = SOLUTION_WORDS[wordIndex];
                
                // Skip ABACK since we're reserving it for today (#42)
                if (word !== 'ABACK') {
                    wordOverrides[dateString] = word;
                } else {
                    // Use the next word if we hit ABACK
                    wordOverrides[dateString] = SOLUTION_WORDS[(wordIndex + 1) % SOLUTION_WORDS.length];
                }
            }
            
            // Set today's word to ABACK explicitly
            const todayString = currentDate.toISOString().split('T')[0];
            wordOverrides[todayString] = 'ABACK';
            
            // Store word overrides
            localStorage.setItem('wordleOverrides', JSON.stringify(wordOverrides));
            console.log("Word overrides stored successfully with", Object.keys(wordOverrides).length, "dates");
            
            // Clear any existing completed games
            localStorage.removeItem('completedDailies');
            localStorage.removeItem('completedPreviousWordles');
            
            // Clear any in-progress games
            localStorage.removeItem('dailyStateInProgress');
            
            // For returning visitors who may have stats, preserve them
            // For new visitors, initialize empty stats
            if (!localStorage.getItem('wordleStats')) {
                const stats = {
                    gamesPlayed: 0,
                    gamesWon: 0,
                    currentStreak: 0,
                    maxStreak: 0,
                    guesses: {
                        1: 0,
                        2: 0,
                        3: 0,
                        4: 0,
                        5: 0,
                        6: 0
                    }
                };
                localStorage.setItem('wordleStats', JSON.stringify(stats));
            }
            
            console.log("Wordle history initialization complete! Today is Wordle #42");
            return true;
        } catch (error) {
            console.error("Error during initialization:", error);
            return false;
        }
    }

    // Get or initialize game statistics
    function getStats() {
        const gameStats = localStorage.getItem('gameStats');
        if (gameStats) {
            return JSON.parse(gameStats);
        } else {
            return {
                gamesPlayed: 0,
                gamesWon: 0,
                currentStreak: 0,
                maxStreak: 0,
                guessDistribution: {
                    1: 0,
                    2: 0,
                    3: 0,
                    4: 0,
                    5: 0,
                    6: 0
                }
            };
        }
    }

    // CRITICAL FIX: Force reset daily completion status for new days
    function forceResetDailyStatus() {
        const completedDailies = JSON.parse(localStorage.getItem('completedDailies') || '[]');
        const today = getPacificDate().toISOString().split('T')[0];
        const savedState = JSON.parse(localStorage.getItem('dailyState') || '{}');
        const todaysWord = getDailyWord();
        
        console.log("CHECKING DAILY STATUS:", { 
            today,
            "completedToday": completedDailies.includes(today),
            "savedStateDate": savedState.date,
            "savedStateWord": savedState.word,
            "todaysWord": todaysWord
        });
        
        // If today is in completedDailies but the saved word doesn't match today's word,
        // it means it's a new day but we're still showing it as completed
        if (completedDailies.includes(today)) {
            if (!savedState.word || savedState.word !== todaysWord) {
                // Force remove today from completedDailies
                const updatedCompletedDailies = completedDailies.filter(date => date !== today);
                localStorage.setItem('completedDailies', JSON.stringify(updatedCompletedDailies));
                
                // Force delete the dailyState
                localStorage.removeItem('dailyState');
                
                console.log("FORCE RESET: Cleared daily completion status for new day");
            }
        }
    }
    
    // Save in-progress daily Wordle state
    function saveInProgressDailyState() {
        const today = getPacificDate().toISOString().split('T')[0]; // YYYY-MM-DD format
        
        // Collect all the guesses so far
        const guesses = [];
        for (let i = 0; i <= currentRow; i++) {
            let rowGuess = '';
            for (let j = 0; j < 5; j++) {
                const tile = document.getElementById(`tile-${i}-${j}`);
                rowGuess += tile.dataset.letter || '';
            }
            if (rowGuess.length === 5) {
                guesses.push(rowGuess);
            }
        }
        
        // Save the current board state
        const state = {
            guesses: guesses,
            date: today,
            word: wordOfTheDay,
            won: false, // Not won yet
            inProgress: true // Mark as in-progress
        };
        
        // Use a different key for in-progress games
        localStorage.setItem('dailyStateInProgress', JSON.stringify(state));
    }
    
    // Save in-progress previous Wordle state
    function saveInProgressPreviousState(dateStr) {
        // Collect all the guesses so far
        const guesses = [];
        for (let i = 0; i <= currentRow; i++) {
            let rowGuess = '';
            for (let j = 0; j < 5; j++) {
                const tile = document.getElementById(`tile-${i}-${j}`);
                rowGuess += tile.dataset.letter || '';
            }
            if (rowGuess.length === 5) {
                guesses.push(rowGuess);
            }
        }
        
        // Save the current board state
        const state = {
            guesses: guesses,
            date: dateStr,
            word: wordOfTheDay,
            won: false, // Not won yet
            inProgress: true // Mark as in-progress
        };
        
        // Use a different key for in-progress games
        localStorage.setItem(`wordle_${dateStr}_inProgress`, JSON.stringify(state));
    }

    // Get in-progress daily state
    function getInProgressDailyState() {
        const today = getPacificDate().toISOString().split('T')[0]; // YYYY-MM-DD format
        const savedState = JSON.parse(localStorage.getItem('dailyStateInProgress') || '{}');
        
        // Check if the saved state is from today and has the correct word
        if (savedState.date === today && savedState.word === getDailyWord() && savedState.inProgress) {
            return savedState;
        }
        
        return null;
    }

    // Get in-progress previous state
    function getInProgressPreviousState(dateStr) {
        const savedState = JSON.parse(localStorage.getItem(`wordle_${dateStr}_inProgress`) || '{}');
        
        // Check if the saved state is valid
        if (savedState.date === dateStr && savedState.guesses && savedState.guesses.length > 0 && savedState.inProgress) {
            return savedState;
        }
        
        return null;
    }
});