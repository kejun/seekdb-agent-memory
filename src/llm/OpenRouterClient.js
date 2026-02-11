/**
 * OpenRouter API 客户端
 * 用于调用 Qwen3 Max 等大模型
 */
export class OpenRouterClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
    this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
    this.model = config.model || process.env.LLM_MODEL || 'qwen/qwen3-max';
    this.appName = config.appName || process.env.APP_NAME || 'SeekDB Agent';
    this.appUrl = config.appUrl || process.env.APP_URL || 'http://localhost';
  }

  /**
   * 发送聊天请求
   * @param {Array} messages - OpenAI 格式的消息数组
   * @param {Object} options - 额外选项
   * @returns {Promise<string>} - 模型回复
   */
  async chat(messages, options = {}) {
    const {
      temperature = 0.7,
      maxTokens = 2000,
      topP = 1,
      presencePenalty = 0,
      frequencyPenalty = 0,
    } = options;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.appUrl,
        'X-Title': this.appName,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
        presence_penalty: presencePenalty,
        frequency_penalty: frequencyPenalty,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * 带模型降级的聊天请求
   * 当主模型不可用时自动尝试备用模型
   * @param {Array} messages - 消息数组
   * @param {Object} options - 选项
   * @returns {Promise<string>}
   */
  async chatWithFallback(messages, options = {}) {
    const fallbackModels = [
      this.model,
      'qwen/qwen2.5-vl-72b-instruct',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.0-flash-001',
    ];

    const errors = [];

    for (const model of fallbackModels) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': this.appUrl,
            'X-Title': this.appName,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 2000,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`Used model: ${model}`);
          return data.choices[0].message.content;
        }
      } catch (e) {
        errors.push(`${model}: ${e.message}`);
        console.log(`Model ${model} failed, trying next...`);
      }
    }

    throw new Error(`All models failed:\n${errors.join('\n')}`);
  }

  /**
   * 生成 Embedding (备用方案)
   * @param {string} text - 输入文本
   * @returns {Promise<number[]>}
   */
  async embed(text) {
    const model = process.env.EMBEDDING_MODEL || 'qwen/qwen3-embedding-8b';

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.appUrl,
        'X-Title': this.appName,
      },
      body: JSON.stringify({
        model,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }
}

export default OpenRouterClient;
