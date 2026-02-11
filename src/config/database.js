import { SeekdbClient } from 'seekdb';
import { QwenEmbeddingFunction } from '@seekdb/qwen';
import dotenv from 'dotenv';

dotenv.config();

/**
 * 创建 SeekDB 客户端
 * @returns {Promise<SeekdbClient>}
 */
export async function createClient() {
  const client = new SeekdbClient({
    host: process.env.SEEKDB_HOST || '127.0.0.1',
    port: parseInt(process.env.SEEKDB_PORT || '2881'),
    user: process.env.SEEKDB_USER || 'root',
    password: process.env.SEEKDB_PASSWORD || '',
    database: process.env.SEEKDB_DATABASE || 'test',
  });

  return client;
}

/**
 * 创建 Embedding 函数 (Qwen3 via OpenRouter)
 * @returns {QwenEmbeddingFunction}
 */
export function createEmbeddingFunction() {
  // 使用 QwenEmbeddingFunction 但配置为调用 OpenRouter
  // 注意: 这里需要自定义实现，因为 @seekdb/qwen 默认调用 DashScope
  return new OpenRouterEmbeddingFunction({
    apiKey: process.env.OPENROUTER_API_KEY,
    modelName: process.env.EMBEDDING_MODEL || 'qwen/qwen3-embedding-8b',
  });
}

/**
 * 自定义 OpenRouter Embedding 函数
 * 实现 seekdb-js 的 EmbeddingFunction 接口
 */
class OpenRouterEmbeddingFunction {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.modelName = config.modelName;
    this.baseUrl = 'https://openrouter.ai/api/v1';
  }

  get name() {
    return 'openrouter-qwen-embedding';
  }

  getConfig() {
    return {
      apiKey: this.apiKey ? '***' : undefined,
      modelName: this.modelName,
    };
  }

  /**
   * 生成嵌入向量
   * @param {string[]} texts - 文本数组
   * @returns {Promise<number[][]>} - 嵌入向量数组
   */
  async generate(texts) {
    const embeddings = [];

    for (const text of texts) {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost',
          'X-Title': process.env.APP_NAME || 'SeekDB Agent',
        },
        body: JSON.stringify({
          model: this.modelName,
          input: text,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Embedding API error: ${error}`);
      }

      const data = await response.json();
      embeddings.push(data.data[0].embedding);
    }

    return embeddings;
  }
}

export { OpenRouterEmbeddingFunction };
