import { SeekdbClient } from 'seekdb';
import { QwenEmbeddingFunction } from '@seekdb/qwen';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create SeekDB client
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
 * Create Embedding function (Qwen3 via OpenRouter)
 * @returns {QwenEmbeddingFunction}
 */
export function createEmbeddingFunction() {
  // Using custom implementation because @seekdb/qwen defaults to DashScope
  return new OpenRouterEmbeddingFunction({
    apiKey: process.env.OPENROUTER_API_KEY,
    modelName: process.env.EMBEDDING_MODEL || 'qwen/qwen3-embedding-8b',
  });
}

/**
 * Get Embedding vector dimension
 * Priority: environment variable EMBEDDING_DIMENSION, fallback to default
 * @returns {number}
 */
export function getEmbeddingDimension() {
  const DEFAULT_DIMENSION = 4096;
  const rawDimension = process.env.EMBEDDING_DIMENSION;

  if (!rawDimension) {
    return DEFAULT_DIMENSION;
  }

  const dimension = Number.parseInt(rawDimension, 10);
  if (!Number.isInteger(dimension) || dimension <= 0) {
    console.warn(
      `[config] Invalid EMBEDDING_DIMENSION="${rawDimension}", fallback to ${DEFAULT_DIMENSION}.`,
    );
    return DEFAULT_DIMENSION;
  }

  return dimension;
}

/**
 * Custom OpenRouter Embedding function
 * Implements seekdb-js EmbeddingFunction interface
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
   * Generate embeddings
   * @param {string[]} texts - Array of texts
   * @returns {Promise<number[][]>} - Array of embedding vectors
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
