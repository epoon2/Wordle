// Shared daily-Wordle logic: date handling and deterministic word selection.
// Loaded by index.html and game.html AFTER words.js (it uses SOLUTION_WORDS)
// and BEFORE any script that calls these functions.

// The date of Wordle #1. This is a fixed constant, never computed and never
// stored, so every visitor on every device derives the exact same numbering
// and the exact same words from it - for today and for every past day.
// Pick it once before deploying and never change it again.
const WORDLE_EPOCH = '2025-02-23';

const MS_IN_DAY = 86400000;

// Today's date in Pacific Time as a 'YYYY-MM-DD' string.
// The 'en-CA' locale formats dates as YYYY-MM-DD directly.
function getPacificDateString() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

// Convert a 'YYYY-MM-DD' string to a UTC timestamp at midnight.
// All date arithmetic happens in UTC, which has no daylight-saving
// transitions, so day differences are always exact multiples of 24 hours.
function dateStringToUTC(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
}

// Whole days from the epoch to the given date (0 on the epoch itself).
function daysSinceEpoch(dateStr) {
    return Math.round((dateStringToUTC(dateStr) - dateStringToUTC(WORDLE_EPOCH)) / MS_IN_DAY);
}

// The Wordle number for a date: the epoch day is #1.
function getWordleNumberForDate(dateStr) {
    return daysSinceEpoch(dateStr) + 1;
}

// The date string for a Wordle number (#1 = the epoch).
// Safe to use toISOString here because the timestamp is UTC midnight.
function getDateForWordleNumber(number) {
    const ms = dateStringToUTC(WORDLE_EPOCH) + (number - 1) * MS_IN_DAY;
    return new Date(ms).toISOString().split('T')[0];
}

// The deterministic solution word for a date.
// Multiplying by a large prime that shares no factors with the list length
// jumps around the solution list instead of walking it alphabetically, and
// still visits every word exactly once before repeating.
// The double-modulo keeps the index positive even for dates before the epoch.
function getSolutionForDate(dateStr) {
    const day = daysSinceEpoch(dateStr);
    const len = SOLUTION_WORDS.length;
    const index = ((day * 2069) % len + len) % len;
    return SOLUTION_WORDS[index];
}
