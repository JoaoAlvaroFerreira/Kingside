# Engine Setup Guide

Kingside supports chess engine analysis via an external API. Local Stockfish integration is not currently available due to React Native Web bundler complexity.

## Option 1: Simple Python API (Recommended)

Create a simple Flask API that wraps Stockfish:

```python
# engine_api.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import chess
import chess.engine

app = Flask(__name__)
CORS(app)  # Enable CORS for Expo dev server

# Path to your stockfish binary
STOCKFISH_PATH = "/usr/local/bin/stockfish"  # Adjust for your system
engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.json
    fen = data.get('fen')
    depth = data.get('depth', 20)

    board = chess.Board(fen)
    info = engine.analyse(board, chess.engine.Limit(depth=depth))

    score = info['score'].relative.score(mat=100)
    mate = info['score'].relative.mate()
    best_move = str(info.get('pv', [None])[0])

    return jsonify({
        'fen': fen,
        'depth': depth,
        'score': score if score is not None else (10000 if mate and mate > 0 else -10000),
        'mate': mate,
        'bestMove': best_move,
        'pv': [str(m) for m in info.get('pv', [])],
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

Install dependencies:
```bash
pip install flask flask-cors python-chess
```

Run:
```bash
python engine_api.py
```

Configure in Kingside:
1. Go to **Settings** → **Engine**
2. Select **External API**
3. Enter URL: `http://localhost:5000/analyze`
4. Test connection
5. Save

## Option 2: Node.js API

```javascript
// engine-server.js
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

const STOCKFISH_PATH = '/usr/local/bin/stockfish'; // Adjust

app.post('/analyze', (req, res) => {
  const { fen, depth = 20 } = req.body;

  const stockfish = spawn(STOCKFISH_PATH);
  let output = '';
  let bestMove = '';
  let score = 0;
  let mate = null;

  stockfish.stdout.on('data', (data) => {
    output += data.toString();

    // Parse UCI output
    const lines = output.split('\\n');
    for (const line of lines) {
      if (line.includes('score cp')) {
        const match = line.match(/score cp (-?\\d+)/);
        if (match) score = parseInt(match[1]);
      }
      if (line.includes('score mate')) {
        const match = line.match(/score mate (-?\\d+)/);
        if (match) mate = parseInt(match[1]);
      }
      if (line.startsWith('bestmove')) {
        bestMove = line.split(' ')[1];
      }
    }
  });

  stockfish.stdin.write(`position fen ${fen}\\n`);
  stockfish.stdin.write(`go depth ${depth}\\n`);

  setTimeout(() => {
    stockfish.kill();
    res.json({ fen, depth, score, mate, bestMove, pv: [] });
  }, 10000);
});

app.listen(5000, () => console.log('Engine API on http://localhost:5000'));
```

## Option 3: Docker Container

```dockerfile
FROM python:3.9-slim
RUN apt-get update && apt-get install -y stockfish
COPY engine_api.py /app/
WORKDIR /app
RUN pip install flask flask-cors python-chess
CMD ["python", "engine_api.py"]
```

Build and run:
```bash
docker build -t chess-engine-api .
docker run -p 5000:5000 chess-engine-api
```

## Option 4: Cloud Hosting

Deploy the Python API to:
- **Heroku** (free tier)
- **Railway** (free tier)
- **Render** (free tier)
- **Fly.io** (free tier)

Then use the public URL in Kingside settings.

## Enabling Engine in Kingside

After setting up your API:

1. **Settings Screen**:
   - Engine Type: External API
   - API Endpoint: Your API URL
   - Depth: 15-20 (recommended)
   - Test Connection

2. **Analysis Board**:
   - Click ⚙️ gear icon
   - Enable "Engine Analysis"
   - Enable "Evaluation Bar"
   - Eval bar will appear next to board

## Troubleshooting

### CORS Errors
Make sure your API has CORS enabled. For Flask:
```python
from flask_cors import CORS
CORS(app)
```

### Timeout Errors
- Increase timeout in Settings
- Reduce depth (try 12-15 instead of 20)
- Use faster hardware

### Connection Refused
- Check API is running
- Verify URL is correct
- Check firewall settings
- For `localhost`, use `http://` not `https://`

## Performance Tips

- **Depth 12-15**: Fast, good for realtime analysis
- **Depth 18-20**: Slower, more accurate for review
- **Depth 25+**: Very slow, tournament quality

## Future: Local Stockfish

Local Stockfish WASM integration is planned but currently blocked by:
- Expo Web bundler limitations with Web Workers
- WASM file loading complexity
- Cross-origin isolation requirements

Contribute at: https://github.com/your-repo
