import { createClient } from '../config/database.js';
import { AgentMemory } from '../memory/AgentMemory.js';
import { OpenRouterClient } from '../llm/OpenRouterClient.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * 聊天 Agent 演示
 * 展示如何使用 SeekDB 记忆系统构建 AI Agent
 */
export class ChatAgent {
  constructor() {
    this.memory = null;
    this.llm = new OpenRouterClient();
    this.client = null;
  }

  /**
   * 初始化 Agent
   */
  async init() {
    console.log('🚀 Initializing Chat Agent...\n');

    // 连接 SeekDB
    this.client = await createClient();

    // 初始化记忆系统
    this.memory = new AgentMemory(this.client, 'chat_memory');
    await this.memory.init();

    const stats = await this.memory.stats();
    console.log(`📊 Memory stats: ${stats.totalMessages} messages stored\n`);

    console.log('✅ Agent ready!\n');
  }

  /**
   * 对话
   * @param {string} userMessage - 用户消息
   * @returns {Promise<string>} - Agent 回复
   */
  async chat(userMessage) {
    console.log(`👤 User: ${userMessage}`);

    // 1. 召回相关历史记忆
    const relevantHistory = await this.memory.recall(userMessage, {
      strategy: 'threshold',
      threshold: 0.7,
    });

    console.log(`🧠 Recalled ${relevantHistory.length} relevant memories`);

    // 2. 构建系统提示
    const systemPrompt = this._buildSystemPrompt(relevantHistory);

    // 3. 调用 LLM
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const response = await this.llm.chat(messages);

    // 4. 存储对话
    await this.memory.store('user', userMessage);
    await this.memory.store('assistant', response);

    console.log(`🤖 Assistant: ${response}\n`);

    return response;
  }

  /**
   * 构建系统提示
   * @private
   */
  _buildSystemPrompt(relevantHistory) {
    if (relevantHistory.length === 0) {
      return '你是一个有用的 AI 助手。请回答用户的问题。';
    }

    const context = relevantHistory
      .map(h => `${h.role}: ${h.message}`)
      .join('\n');

    return `你是一个有用的 AI 助手。以下是与当前问题相关的历史对话，请基于这些信息回答用户的问题：

${context}

请根据以上历史对话回答用户的新问题。如果历史对话与当前问题无关，请忽略它们。`;
  }

  /**
   * 演示场景
   */
  async runDemo() {
    await this.init();

    console.log('=== Demo 1: 基础对话 ===');
    await this.chat('你好，我叫张三，是一名程序员');
    await this.chat('我喜欢写什么代码？');  // 应该回忆起"程序员"

    console.log('=== Demo 2: 话题切换 ===');
    await this.chat('北京今天天气怎么样？');  // 无关历史应被过滤

    console.log('=== Demo 3: 个人信息 ===');
    await this.chat('我叫什么名字？');  // 应该回忆起"张三"

    console.log('=== Demo 4: 不同召回策略对比 ===');
    const query = '我的职业是什么？';

    console.log('\n📌 Threshold strategy (threshold=0.75):');
    const thresholdResults = await this.memory.recall(query, {
      strategy: 'threshold',
      threshold: 0.75,
    });
    console.log(`Found ${thresholdResults.length} results:`,
      thresholdResults.map(r => ({ message: r.message.substring(0, 30), similarity: r.similarity })));

    console.log('\n📌 Limit strategy (limit=3):');
    const limitResults = await this.memory.recall(query, {
      strategy: 'limit',
      limit: 3,
    });
    console.log(`Found ${limitResults.length} results:`,
      limitResults.map(r => ({ message: r.message.substring(0, 30), similarity: r.similarity })));

    console.log('\n📌 Hybrid strategy (threshold=0.5, limit=5):');
    const hybridResults = await this.memory.recallHybrid(query, {
      threshold: 0.5,
      limit: 5,
    });
    console.log(`Found ${hybridResults.length} results:`,
      hybridResults.map(r => ({ message: r.message.substring(0, 30), similarity: r.similarity })));

    // 最终统计
    const stats = await this.memory.stats();
    console.log(`\n📊 Final memory stats: ${stats.totalMessages} messages stored`);

    // 关闭连接
    await this.client.close();
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new ChatAgent();
  agent.runDemo().catch(console.error);
}

export default ChatAgent;
