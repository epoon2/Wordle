// Word List Converter
// This script helps you convert the word lists into properly formatted JavaScript arrays
// for your Wordle game.

// Instructions:
// 1. Save this file as 'word-list-converter.js'
// 2. Create a text file called 'solution-words.txt' with all 2,309 solution words (one per line)
// 3. Create a text file called 'valid-guesses.txt' with all valid guess words (one per line)
// 4. Run this script with Node.js: node word-list-converter.js
// 5. It will generate a 'words.js' file with properly formatted arrays

const fs = require('fs');

// Read the solution words file
let solutionWords = [];
try {
    const solutionWordsText = fs.readFileSync('solution-words.txt', 'utf8');
    solutionWords = solutionWordsText
        .split(/\r?\n/)
        .filter(word => word.trim().length > 0)
        .map(word => word.trim().toUpperCase());
    
    console.log(`Read ${solutionWords.length} solution words`);
} catch (err) {
    console.error('Error reading solution words file:', err);
    console.log('Please create a solution-words.txt file with all solution words (one per line)');
}

// Read the valid guesses file
let validGuesses = [];
try {
    const validGuessesText = fs.readFileSync('valid-guesses.txt', 'utf8');
    validGuesses = validGuessesText
        .split(/\r?\n/)
        .filter(word => word.trim().length > 0)
        .map(word => word.trim().toUpperCase())
        // Filter out words that are already in the solution list
        .filter(word => !solutionWords.includes(word));
    
    console.log(`Read ${validGuesses.length} additional valid guess words`);
} catch (err) {
    console.error('Error reading valid guesses file:', err);
    console.log('Please create a valid-guesses.txt file with all valid guess words (one per line)');
}

// Generate the words.js file content
const wordsJsContent = `// Generated Wordle word lists
// Solution words: ${solutionWords.length}
// Additional valid guesses: ${validGuesses.length}

// List of words that can be used as solutions (official Wordle answers)
const SOLUTION_WORDS = [
    ${formatWordArray(solutionWords)}
];

// Additional valid guess words (not solutions)
const ADDITIONAL_VALID_WORDS = [
    ${formatWordArray(validGuesses)}
];

// Combine both lists for valid guesses
const ALL_VALID_WORDS = [...SOLUTION_WORDS, ...ADDITIONAL_VALID_WORDS];

// Get a random word from the solution list
function getRandomWord() {
    return SOLUTION_WORDS[Math.floor(Math.random() * SOLUTION_WORDS.length)];
}

// Check if a word is in either list of valid words
function isValidWord(word) {
    return ALL_VALID_WORDS.includes(word.toUpperCase());
}`;

// Write the generated content to words.js
try {
    fs.writeFileSync('src/words.js', wordsJsContent);
    console.log('Successfully generated src/words.js');
} catch (err) {
    console.error('Error writing words.js file:', err);
    // Try writing to the current directory if src/ doesn't exist
    try {
        fs.writeFileSync('words.js', wordsJsContent);
        console.log('Successfully generated words.js in current directory');
    } catch (innerErr) {
        console.error('Error writing words.js to current directory:', innerErr);
    }
}

// Helper function to format array of words with proper quotes and line breaks
function formatWordArray(words) {
    const wordsPerLine = 8;
    const lines = [];
    
    for (let i = 0; i < words.length; i += wordsPerLine) {
        const line = words.slice(i, i + wordsPerLine)
            .map(word => `'${word}'`)
            .join(', ');
        lines.push(line);
    }
    
    return lines.join(',\n    ');
} 