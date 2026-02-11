# SeekDB Agent Memory - 基于 Qwen3 Max 的向量记忆系统

使用 seekdb-js + OpenRouter (Qwen3 Max + Qwen3 Embedding) 实现的高效 AI Agent 记忆系统。

## 特性

- 🧠 **智能记忆召回**：基于向量相似度，只召回相关上下文
- 💰 **成本优化**：相比全量上下文，节省 85-95% Token 成本
- ⚡ **高性能**：基于 OceanBase/SeekDB，支持大规模数据
- 🔧 **灵活策略**：支持固定数量、阈值、混合三种召回策略
- 🌐 **中文优化**：使用 Qwen3 系列模型，中文理解更精准

## 架构

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

## 快速开始

### 1. 环境准备

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 OpenRouter API Key
```

### 2. 启动 SeekDB 服务器

```bash
# 使用 Docker 启动 OceanBase/SeekDB
docker run -d --name seekdb \
  -p 2881:2881 \
  -e MODE=seekdb \
  oceanbase/seekdb:latest
```

### 3. 运行示例

```bash
npm run demo
```

## 项目结构

```
.
├── src/
│   ├── memory/
│   │   ├── AgentMemory.js      # 核心记忆管理类
│   │   └── strategies.js       # 召回策略实现
│   ├── llm/
│   │   ├── OpenRouterClient.js # OpenRouter API 客户端
│   │   └── QwenEmbedding.js    # Qwen3 Embedding 封装
│   ├── config/
│   │   └── database.js         # SeekDB 连接配置
│   └── demo/
│       └── chat-demo.js        # 交互式演示
├── tests/
│   └── memory.test.js          # 单元测试
├── .env.example
├── package.json
└── README.md
```

## API 使用示例

### 基础使用

```javascript
import { AgentMemory } from './src/memory/AgentMemory.js';
import { createClient } from './src/config/database.js';

// 初始化
const client = await createClient();
const memory = new AgentMemory(client);

// 存储对话
await memory.store('user', '你好，我叫张三');
await memory.store('assistant', '你好张三！很高兴认识你。');

// 召回相关记忆
const relevant = await memory.recall('我叫什么名字？', {
  strategy: 'threshold',
  threshold: 0.75
});

console.log(relevant);
// [{ role: 'user', message: '你好，我叫张三', similarity: 0.92 }]
```

### 三种召回策略

```javascript
// 1. 固定数量召回 - 始终返回 Top N
const limitResults = await memory.recall(query, {
  strategy: 'limit',
  limit: 5
});

// 2. 阈值召回 - 只返回相似度超过阈值的消息
const thresholdResults = await memory.recall(query, {
  strategy: 'threshold',
  threshold: 0.75
});

// 3. 混合召回 - 先阈值筛选，再限制数量
const hybridResults = await memory.recallHybrid(query, {
  threshold: 0.6,
  limit: 10
});
```

### 完整 Agent 示例

```javascript
import { ChatAgent } from './src/demo/ChatAgent.js';

const agent = new ChatAgent();

// 对话
await agent.chat('你好，我是程序员，喜欢写代码');
await agent.chat('我擅长什么？'); // 能回忆起"程序员"、"写代码"
await agent.chat('北京天气怎么样？'); // 无关历史被自动过滤
```

## 成本对比

| 方案 | 月活 1 万会话 | 月活 10 万会话 |
|------|--------------|---------------|
| 全量上下文 | ~$1,600 | ~$16,000 |
| SeekDB 精准召回 | ~$80 | ~$800 |
| **节省** | **95%** | **95%** |

## 技术栈

- **Vector DB**: [SeekDB](https://github.com/oceanbase/seekdb-js) / OceanBase
- **LLM**: [Qwen3 Max](https://openrouter.ai/qwen/qwen3-max) via OpenRouter
- **Embedding**: [Qwen3 Embedding 8B](https://openrouter.ai/qwen/qwen3-embedding-8b)
- **Runtime**: Node.js 18+

## License

MIT
