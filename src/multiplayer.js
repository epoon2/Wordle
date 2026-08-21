// Wordle Duel: head-to-head multiplayer client.
// The server (netlify/functions) is the authority for everything: it picks
// the word, validates and scores guesses, and only reveals the word once
// the match is decided. This file is UI, input, and a 2-second poll loop.

document.addEventListener('DOMContentLoaded', () => {
    const POLL_MS = 2000;
    const RESULTS_POLL_MS = 3000;

    // --- Match session state ---
    let code = null;          // room code
    let playerId = null;      // our server-issued id
    let phase = 'lobby';      // lobby | waiting | countdown | active | finished
    let startAt = null;       // server timestamp the match starts at
    let clockOffset = 0;      // serverNow - Date.now(), for the countdown/timer
    let pollTimer = null;
    let tickTimer = null;
    let rematchRequested = false;
    let series = null;        // running score across this chain of rematches

    // --- Board state ---
    let currentRow = 0;
    let currentTile = 0;
    let inputLocked = true;

    // ---------------------------------------------------------------
    // API helpers
    // ---------------------------------------------------------------
    async function api(path, options) {
        let response;
        try {
            response = await fetch(path, options);
        } catch (e) {
            throw new Error('Could not reach the game server');
        }
        let data = {};
        try { data = await response.json(); } catch (e) { /* non-JSON error page */ }
        if (!response.ok) {
            throw new Error(data.error || 'Multiplayer needs the Netlify deployment');
        }
        return data;
    }

    const post = (path, body) => api(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
    });

    // ---------------------------------------------------------------
    // Session persistence, so a refresh mid-match resumes
    // ---------------------------------------------------------------
    function saveSession() {
        sessionStorage.setItem('duelSession', JSON.stringify({ code, playerId }));
    }
    function clearSession() {
        sessionStorage.removeItem('duelSession');
    }
    function loadSession() {
        try {
            return JSON.parse(sessionStorage.getItem('duelSession'));
        } catch (e) { return null; }
    }

    // ---------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------
    const views = {
        lobby: document.getElementById('view-lobby'),
        waiting: document.getElementById('view-waiting'),
        game: document.getElementById('view-game'),
        results: document.getElementById('view-results')
    };

    function showView(name) {
        Object.entries(views).forEach(([key, el]) => {
            el.style.display = key === name ? '' : 'none';
        });
    }

    function showMessage(message) {
        const container = document.getElementById('message-container');
        container.textContent = message;
        container.style.opacity = 1;
        setTimeout(() => { container.style.opacity = 0; }, 2000);
    }

    // ---------------------------------------------------------------
    // Duel record
    // ---------------------------------------------------------------
    // Kept in localStorage on this device. There is no account system and
    // room codes are one-shot, so no honest per-opponent record is
    // possible - these totals cover every opponent together.
    const STATS_KEY = 'duelStats';
    const RECORDED_LIMIT = 50;

    function emptyStats() {
        return { played: 0, won: 0, lost: 0, drawn: 0, solved: 0, guessTotal: 0, bestScore: 0, recorded: [] };
    }

    function loadStats() {
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(STATS_KEY));
        } catch (e) { /* unreadable or disabled storage */ }
        const stats = emptyStats();
        if (!saved || typeof saved !== 'object') return stats;
        Object.keys(stats).forEach(key => {
            if (key === 'recorded') {
                if (Array.isArray(saved.recorded)) stats.recorded = saved.recorded.slice(-RECORDED_LIMIT);
            } else if (Number.isFinite(saved[key])) {
                stats[key] = saved[key];
            }
        });
        return stats;
    }

    function saveStats(stats) {
        try {
            localStorage.setItem(STATS_KEY, JSON.stringify(stats));
        } catch (e) { /* private mode: the record just does not persist */ }
    }

    // Record a finished match once. Reloading the results screen replays
    // the same state, so the room code is the guard against double counting.
    function recordResult(state) {
        const stats = loadStats();
        if (!code || stats.recorded.includes(code)) return;

        stats.played += 1;
        if (state.result === 'win') stats.won += 1;
        else if (state.result === 'loss') stats.lost += 1;
        else stats.drawn += 1;

        const score = state.yourScore;
        if (score) {
            if (score.solved) {
                stats.solved += 1;
                stats.guessTotal += score.guesses;
            }
            if (score.total > stats.bestScore) stats.bestScore = score.total;
        }

        stats.recorded = [...stats.recorded, code].slice(-RECORDED_LIMIT);
        saveStats(stats);
        renderStats();
    }

    function renderStats() {
        const stats = loadStats();
        const winPct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
        const avg = stats.solved ? (stats.guessTotal / stats.solved).toFixed(1) : '\u2013';
        const item = (id, value, label) =>
            `<div class="stat-item"><div id="${id}" class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
        document.getElementById('duel-stats').innerHTML =
            item('duel-played', stats.played, 'Played')
            + item('duel-won', stats.won, 'Won')
            + item('duel-lost', stats.lost, 'Lost')
            + item('duel-win-pct', winPct, 'Win %');
        document.getElementById('duel-stats-extra').innerHTML =
            item('duel-drawn', stats.drawn, 'Drawn')
            + item('duel-avg-guesses', avg, 'Avg guesses')
            + item('duel-best-score', stats.bestScore, 'Best score');
    }

    // ---------------------------------------------------------------
    // Series score
    // ---------------------------------------------------------------
    // The server owns the tally and hands each player their own view of
    // it, so the two screens cannot drift apart. It already includes the
    // current round as soon as that round is decided.
    function seriesText() {
        if (!series) return '';
        if (series.round === 1 && !series.you && !series.opponent && !series.draws) {
            return 'Round 1';
        }
        const drawn = series.draws ? ` · ${series.draws} drawn` : '';
        return `Round ${series.round} · You ${series.you} \u2013 ${series.opponent}${drawn}`;
    }

    function renderSeries() {
        const text = seriesText();
        document.getElementById('series-status').textContent = text;
        document.getElementById('series-line').textContent = text;
    }

    // ---------------------------------------------------------------
    // Board and keyboard
    // ---------------------------------------------------------------
    function buildBoards() {
        const board = document.getElementById('board');
        board.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const row = document.createElement('div');
            row.classList.add('tile-row');
            for (let j = 0; j < 5; j++) {
                const tile = document.createElement('div');
                tile.classList.add('tile');
                tile.id = `tile-${i}-${j}`;
                row.appendChild(tile);
            }
            board.appendChild(row);
        }

        const opp = document.getElementById('opp-board');
        opp.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const row = document.createElement('div');
            row.classList.add('mp-mini-row');
            for (let j = 0; j < 5; j++) {
                const tile = document.createElement('div');
                tile.classList.add('mp-mini-tile');
                tile.id = `opp-tile-${i}-${j}`;
                row.appendChild(tile);
            }
            opp.appendChild(row);
        }
    }

    function resetInput() {
        currentRow = 0;
        currentTile = 0;
        document.querySelectorAll('#keyboard-container button').forEach(key => {
            key.classList.remove('correct', 'present', 'absent');
        });
        document.getElementById('opp-status').textContent = '';
    }

    function addLetter(letter) {
        if (currentTile < 5) {
            const tile = document.getElementById(`tile-${currentRow}-${currentTile}`);
            tile.textContent = letter.toUpperCase();
            tile.classList.add('tile-filled');
            tile.dataset.letter = letter.toUpperCase();
            currentTile++;
        }
    }

    function deleteLetter() {
        if (currentTile > 0) {
            currentTile--;
            const tile = document.getElementById(`tile-${currentRow}-${currentTile}`);
            tile.textContent = '';
            tile.classList.remove('tile-filled');
            tile.dataset.letter = '';
        }
    }

    function paintRow(rowIndex, guess, pattern) {
        for (let i = 0; i < 5; i++) {
            const tile = document.getElementById(`tile-${rowIndex}-${i}`);
            tile.textContent = guess[i];
            tile.dataset.letter = guess[i];
            tile.classList.add('tile-filled');
            setTimeout(() => {
                tile.classList.add(pattern[i]);
                updateKeyboardKey(guess[i], pattern[i]);
            }, i * 250);
        }
    }

    function updateKeyboardKey(letter, state) {
        const key = document.querySelector(`button[data-key="${letter.toLowerCase()}"]`);
        if (!key) return;
        if (key.classList.contains('correct')) return;
        if (key.classList.contains('present') && state === 'absent') return;
        key.classList.remove('correct', 'present', 'absent');
        key.classList.add(state);
    }

    function paintOpponent(patterns) {
        for (let i = 0; i < patterns.length; i++) {
            for (let j = 0; j < 5; j++) {
                const tile = document.getElementById(`opp-tile-${i}-${j}`);
                if (tile && !tile.classList.contains(patterns[i][j])) {
                    tile.classList.add(patterns[i][j]);
                }
            }
        }
    }

    async function submitGuess() {
        if (inputLocked) return;
        if (currentTile !== 5) {
            showMessage('Not enough letters');
            return;
        }
        let guess = '';
        for (let i = 0; i < 5; i++) {
            guess += document.getElementById(`tile-${currentRow}-${i}`).dataset.letter;
        }
        // Fast local check; the server is still the authority
        if (typeof ALL_VALID_WORDS !== 'undefined' && !ALL_VALID_WORDS.includes(guess)) {
            showMessage('Not in word list');
            return;
        }

        inputLocked = true;
        try {
            const result = await post('/api/submit-guess', { code, playerId, guess, rowIndex: currentRow });
            paintRow(currentRow, guess, result.pattern);
            currentRow++;
            currentTile = 0;
            if (result.solved) {
                showMessage('You got it! Waiting for your opponent…');
            } else if (result.failed) {
                showMessage('Out of guesses. Waiting for your opponent…');
            } else {
                inputLocked = false;
            }
            // Pull the new state promptly (the match may just have ended)
            pollNow();
        } catch (e) {
            showMessage(e.message);
            inputLocked = false;
        }
    }

    function handleKey(key) {
        if (phase !== 'active') return;
        if (key === 'enter') {
            submitGuess();
        } else if (key === 'del') {
            if (!inputLocked) deleteLetter();
        } else if (/^[a-z]$/.test(key)) {
            if (!inputLocked) addLetter(key);
        }
    }

    document.querySelectorAll('#keyboard-container button').forEach(button => {
        button.addEventListener('click', () => handleKey(button.dataset.key));
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleKey('enter'); return; }
        if (e.key === 'Backspace') { handleKey('del'); return; }
        if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toLowerCase());
    });

    // ---------------------------------------------------------------
    // Countdown and match timer
    // ---------------------------------------------------------------
    function serverTime() {
        return Date.now() + clockOffset;
    }

    function startTicking() {
        stopTicking();
        tickTimer = setInterval(() => {
            const overlay = document.getElementById('countdown-overlay');
            const status = document.getElementById('match-status');
            if (phase === 'countdown') {
                const remaining = Math.max(0, Math.ceil((startAt - serverTime()) / 1000));
                overlay.style.display = '';
                overlay.textContent = remaining > 0 ? remaining : 'GO!';
                if (remaining <= 0) {
                    phase = 'active';
                    inputLocked = false;
                    setTimeout(() => { overlay.style.display = 'none'; }, 600);
                }
            } else if (phase === 'active') {
                const elapsed = Math.max(0, Math.floor((serverTime() - startAt) / 1000));
                const bonus = Math.max(0, 300 - elapsed);
                status.textContent = `⏱ ${elapsed}s · speed bonus ${bonus}`;
            }
        }, 250);
    }

    function stopTicking() {
        if (tickTimer) clearInterval(tickTimer);
        tickTimer = null;
    }

    // ---------------------------------------------------------------
    // Poll loop
    // ---------------------------------------------------------------
    function schedulePoll(ms) {
        stopPolling();
        pollTimer = setTimeout(poll, ms);
    }

    function stopPolling() {
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = null;
    }

    function pollNow() {
        schedulePoll(0);
    }

    async function poll() {
        if (!code || !playerId) return;
        let state;
        try {
            state = await api(`/api/match-state?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId)}`);
        } catch (e) {
            // Transient network error: keep trying
            schedulePoll(POLL_MS);
            return;
        }

        clockOffset = state.serverNow - Date.now();
        startAt = state.startAt;
        series = state.series || null;
        renderSeries();

        if (state.status === 'waiting') {
            schedulePoll(POLL_MS);
            return;
        }

        if (state.status === 'countdown') {
            if (phase !== 'countdown') enterCountdown();
            schedulePoll(POLL_MS);
            return;
        }

        if (state.status === 'active') {
            if (phase === 'waiting' || phase === 'lobby' || phase === 'countdown') {
                // (Re)entering an active match, e.g. after a refresh
                enterActive(state);
            }
            renderActive(state);
            schedulePoll(POLL_MS);
            return;
        }

        if (state.status === 'finished') {
            enterResults(state);
            schedulePoll(RESULTS_POLL_MS);
            return;
        }

        if (state.status === 'expired') {
            showMessage('Match expired');
            backToLobby();
        }
    }

    // ---------------------------------------------------------------
    // Phase transitions
    // ---------------------------------------------------------------
    function enterWaiting() {
        phase = 'waiting';
        rematchRequested = false;
        document.getElementById('room-code').textContent = code;
        showView('waiting');
        schedulePoll(POLL_MS);
    }

    function enterCountdown() {
        phase = 'countdown';
        rematchRequested = false;
        inputLocked = true;
        buildBoards();
        resetInput();
        document.getElementById('match-status').textContent = 'Get ready…';
        showView('game');
        startTicking();
    }

    function enterActive(state) {
        phase = 'active';
        buildBoards();
        resetInput();
        showView('game');
        startTicking();
        // Repaint our own rows (refresh mid-match)
        state.you.rows.forEach((row, i) => paintRow(i, row.guess, row.pattern));
        currentRow = state.you.rows.length;
        currentTile = 0;
        inputLocked = state.you.finished;
        document.getElementById('countdown-overlay').style.display = 'none';
    }

    function renderActive(state) {
        if (state.opponent) {
            paintOpponent(state.opponent.patterns);
            const oppStatus = document.getElementById('opp-status');
            if (state.opponent.solved) {
                oppStatus.textContent = `Solved in ${state.opponent.guessCount}!`;
            } else if (state.opponent.failed) {
                oppStatus.textContent = 'Out of guesses';
            } else {
                oppStatus.textContent = `${state.opponent.guessCount} ${state.opponent.guessCount === 1 ? 'guess' : 'guesses'}`;
            }
        }
    }

    function enterResults(state) {
        if (phase === 'finished') {
            // Already on the results screen: just watch for a rematch
            maybeFollowRematch(state);
            return;
        }
        phase = 'finished';
        inputLocked = true;
        stopTicking();
        recordResult(state);

        const banner = document.getElementById('result-banner');
        if (state.result === 'win') banner.textContent = state.forfeit ? 'You win by forfeit! 🏆' : 'You win! 🏆';
        else if (state.result === 'loss') banner.textContent = 'You lose';
        else banner.textContent = "It's a draw";

        document.getElementById('result-word').textContent = state.word;

        const yourScore = state.yourScore;
        const oppScore = state.opponentScore;
        const fmt = (s, field) => {
            if (field === 'guesses') return s.solved ? s.guesses : '—';
            if (field === 'seconds') return s.solved ? `${s.seconds}s` : '—';
            return s[field];
        };
        document.getElementById('score-rows').innerHTML = `
            <tr><td>Guesses</td><td>${fmt(yourScore, 'guesses')}</td><td>${fmt(oppScore, 'guesses')}</td></tr>
            <tr><td>Time</td><td>${fmt(yourScore, 'seconds')}</td><td>${fmt(oppScore, 'seconds')}</td></tr>
            <tr><td>Solve bonus</td><td>${yourScore.solveBonus}</td><td>${oppScore.solveBonus}</td></tr>
            <tr><td>Guess points</td><td>${yourScore.guessPoints}</td><td>${oppScore.guessPoints}</td></tr>
            <tr><td>Speed bonus</td><td>${yourScore.speedBonus}</td><td>${oppScore.speedBonus}</td></tr>
            <tr class="mp-total-row"><td>Total</td><td>${yourScore.total}</td><td>${oppScore.total}</td></tr>
        `;
        document.getElementById('rematch-status').textContent = '';
        showView('results');
        maybeFollowRematch(state);
    }

    async function maybeFollowRematch(state) {
        // The opponent started a rematch: follow them into the new room
        if (state.nextCode && !rematchRequested) {
            rematchRequested = true;
            try {
                const joined = await post('/api/join-match', { code: state.nextCode });
                code = joined.code;
                playerId = joined.playerId;
                startAt = joined.startAt;
                saveSession();
                enterCountdown();
                pollNow();
            } catch (e) {
                // Room full or gone: they may have moved on
                document.getElementById('rematch-status').textContent = e.message;
                rematchRequested = false;
            }
        }
    }

    function backToLobby() {
        phase = 'lobby';
        code = null;
        playerId = null;
        rematchRequested = false;
        series = null;
        renderSeries();
        stopPolling();
        stopTicking();
        clearSession();
        document.getElementById('lobby-error').textContent = '';
        showView('lobby');
    }

    // ---------------------------------------------------------------
    // Lobby actions
    // ---------------------------------------------------------------
    document.getElementById('create-button').addEventListener('click', async () => {
        try {
            const created = await post('/api/create-match');
            code = created.code;
            playerId = created.playerId;
            saveSession();
            enterWaiting();
        } catch (e) {
            document.getElementById('lobby-error').textContent = e.message;
        }
    });

    async function joinByCode(joinCode) {
        try {
            const joined = await post('/api/join-match', { code: joinCode });
            code = joined.code;
            playerId = joined.playerId;
            startAt = joined.startAt;
            saveSession();
            enterCountdown();
            pollNow();
        } catch (e) {
            document.getElementById('lobby-error').textContent = e.message;
            showView('lobby');
        }
    }

    document.getElementById('join-button').addEventListener('click', () => {
        joinByCode(document.getElementById('join-code').value.trim().toUpperCase());
    });
    document.getElementById('join-code').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.stopPropagation();
            joinByCode(e.target.value.trim().toUpperCase());
        }
    });

    document.getElementById('copy-link-button').addEventListener('click', () => {
        const link = `${location.origin}${location.pathname}?join=${code}`;
        navigator.clipboard.writeText(link).then(() => {
            showMessage('Invite link copied');
        }).catch(() => {
            showMessage(`Share this code: ${code}`);
        });
    });

    document.getElementById('cancel-button').addEventListener('click', backToLobby);
    document.getElementById('lobby-button').addEventListener('click', backToLobby);

    document.getElementById('rematch-button').addEventListener('click', async () => {
        if (rematchRequested) return;
        rematchRequested = true;
        try {
            const result = await post('/api/rematch', { code, playerId });
            if (result.playerId) {
                // We are the host of the new room
                code = result.nextCode;
                playerId = result.playerId;
                saveSession();
                document.getElementById('rematch-status').textContent = '';
                enterWaiting();
            } else {
                // The opponent's rematch already exists: join it
                const joined = await post('/api/join-match', { code: result.nextCode });
                code = joined.code;
                playerId = joined.playerId;
                startAt = joined.startAt;
                saveSession();
                enterCountdown();
                pollNow();
            }
        } catch (e) {
            document.getElementById('rematch-status').textContent = e.message;
            rematchRequested = false;
        }
    });

    // How-to-play modal
    const howModal = document.getElementById('how-modal');
    document.getElementById('how-button').addEventListener('click', () => {
        howModal.style.display = 'block';
    });
    document.getElementById('how-close').addEventListener('click', () => {
        howModal.style.display = 'none';
    });
    window.addEventListener('click', (e) => {
        if (e.target === howModal) howModal.style.display = 'none';
    });

    // ---------------------------------------------------------------
    // Entry: invite link, resumed session, or plain lobby
    // ---------------------------------------------------------------
    renderStats();

    const inviteCode = new URLSearchParams(location.search).get('join');
    const saved = loadSession();
    if (inviteCode) {
        history.replaceState(null, '', location.pathname);
        joinByCode(inviteCode.trim().toUpperCase());
    } else if (saved && saved.code && saved.playerId) {
        code = saved.code;
        playerId = saved.playerId;
        enterWaiting();
        pollNow();
    } else {
        showView('lobby');
    }
});
