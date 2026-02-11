# SeekDB Agent Memory - Vector Memory System with Qwen3 Max

Efficient AI Agent memory system using seekdb-js + OpenRouter (Qwen3 Max + Qwen3 Embedding).

## Features

- 🧠 **Smart Memory Recall**: Only recall relevant context based on vector similarity
- 💰 **Cost Optimization**: Save 85-95% Token costs compared to full context
- ⚡ **High Performance**: Based on OceanBase/SeekDB, supports large-scale data
- 🔧 **Flexible Strategies**: Three recall strategies - limit, threshold, hybrid

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   User      │────▶│  Agent Core  │────▶│  Qwen3 Max      │
│   Query     │     │              │     │  (OpenRouter)   │
└─────────────┘     └──────┬───────┘     └─────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  SeekDB      │
                    │  (Vector DB) │
                    └──────────────┘
```

## Quick Start

### 1. Environment Setup

```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env to add your OpenRouter API Key
# If switching Embedding model, update EMBEDDING_DIMENSION accordingly
```

### 2. Start SeekDB Server

```bash
# Pull SeekDB image
docker pull oceanbase/seekdb:latest

# Start SeekDB container
docker run -d \
  --name seekdb \
  -p 2881:2881 \
  -e MODE=slim \
  oceanbase/seekdb:latest
```

### 3. Run Demo

```bash
npm run demo
```

## Project Structure

```
.
├── src/
│   ├── memory/
│   │   ├── AgentMemory.js      # Core memory management class
│   │   └── strategies.js       # Recall strategy implementations
│   ├── llm/
│   │   ├── OpenRouterClient.js # OpenRouter API client
│   │   └── QwenEmbedding.js    # Qwen3 Embedding wrapper
│   ├── config/
│   │   └── database.js         # SeekDB connection configuration
│   └── demo/
│       └── chat-demo.js        # Interactive demo
├── tests/
│   └── memory.test.js          # Unit tests
├── .env.example
├── package.json
└── README.md
```

## API Usage Examples

### Basic Usage

```javascript
import { AgentMemory } from './src/memory/AgentMemory.js';
import { createClient } from './src/config/database.js';

// Initialize
const client = await createClient();
const memory = new AgentMemory(client);

// Store conversation
await memory.store('user', 'Hello, my name is Zhang San');
await memory.store('assistant', 'Hello Zhang San! Nice to meet you.');

// Recall relevant memories
const relevant = await memory.recall('What is my name?', {
  strategy: 'threshold',
  threshold: 0.75
});

console.log(relevant);
// [{ role: 'user', message: 'Hello, my name is Zhang San', similarity: 0.92 }]
```

### Three Recall Strategies

```javascript
// 1. Limit-based - Always return Top N
const limitResults = await memory.recall(query, {
  strategy: 'limit',
  limit: 5
});

// 2. Threshold-based - Only return messages above similarity threshold
const thresholdResults = await memory.recall(query, {
  strategy: 'threshold',
  threshold: 0.75,
  role: 'user' // Optional: filter by role
});

// 3. Hybrid - Threshold filter first, then limit quantity
const hybridResults = await memory.recallHybrid(query, {
  threshold: 0.6,
  limit: 10
});
```

### Complete Agent Example

```javascript
import { ChatAgent } from './src/demo/chat-demo.js';

const agent = new ChatAgent();

// Chat
await agent.chat('Hello, I am a programmer who loves coding');
await agent.chat('What am I good at?'); // Recalls "programmer", "coding"
await agent.chat('How is the weather in Beijing?'); // Irrelevant history filtered
```

## Cost Comparison

| Solution | 10K Sessions/Month | 100K Sessions/Month |
|----------|-------------------|---------------------|
| Full Context | ~$1,600 | ~$16,000 |
| SeekDB Precision Recall | ~$80 | ~$800 |
| **Savings** | **95%** | **95%** |

## Tech Stack

- **Vector DB**: [SeekDB](https://github.com/oceanbase/seekdb-js) / OceanBase
- **LLM**: [Qwen3 Max](https://openrouter.ai/qwen/qwen3-max) via OpenRouter
- **Embedding**: [Qwen3 Embedding 8B](https://openrouter.ai/qwen/qwen3-embedding-8b)
- **Runtime**: Node.js 18+

## License

MIT
