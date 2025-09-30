# Kostelio Klausimynas

**Kostelio Klausimynas** is a mobile‑first quiz game built for interactive TikTok LIVE streams.  
It is designed to let streamers engage their audience in real time with question‑and‑answer gameplay.

## Features

- **Mobile‑first responsive UI**: Clean, modern layout that works well on phones and tablets.  
- **Game flow**:  
  - Load a question bank from a JSON file.  
  - Timer‑gated answering with visible progress bar.  
  - Automatic or manual next question progression.  
  - Reveal correct answer with optional notes/explanations.  
- **Scoring system**:  
  - +10 points for correct answers.  
  - Tracks leaderboard across rounds.  
  - Player data stored in memory for session.  
- **WebSocket chat bridge**:  
  - Supports integration with TikTok chat via relay server.  
  - Accepts simple messages like `A/B/C/D` or `1/2/3/4` as valid answers.  
  - Captures player name and avatar when available.  
- **Audio feedback**: ticking sound while timer runs, fail sound when nobody answers correctly.  
- **Lightweight deployment**: Pure HTML, CSS, and JavaScript. No backend required (except optional WebSocket relay).

## File structure

```
index.html    # Main HTML structure
style.css     # Stylesheet
app.js        # Game logic
quiz-bank.json (example) # Bank of questions (not included here)
```

## Getting started

1. Clone or download this repository.  
2. Open `index.html` in a browser.  
3. In **Nustatymai (Settings)**, upload a JSON question bank file.  
   - Format:  
     ```json
     [
       {
         "q": "What is 2+2?",
         "correct": "4",
         "wrong": ["3","5","6"],
         "note": "Basic arithmetic",
         "cat": "math"
       }
     ]
     ```
4. Start a game from the home screen.

## WebSocket integration

To enable TikTok LIVE chat answers, run a small Node.js relay server that connects to TikTok via [`tiktok-live-connector`](https://www.npmjs.com/package/tiktok-live-connector) and broadcasts messages over WebSocket.

- Sample `server.js` and `package.json` are typically included in deployment setups.  
- Default WebSocket URL: `ws://localhost:8081`

## Use cases

- Streamers hosting trivia nights on TikTok LIVE.  
- Local events or classroom quizzes with audience participation.  
- Lightweight demo of WebSocket‑driven multiplayer interaction.

## License

This project is open source. License: MIT.
