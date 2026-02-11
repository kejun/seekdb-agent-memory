import { createClient } from '../config/database.js';
import { AgentMemory } from '../memory/AgentMemory.js';
import { OpenRouterClient } from '../llm/OpenRouterClient.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Chat Agent Demo
 * Demonstrates how to build an AI Agent using SeekDB memory system
 */
export class ChatAgent {
  constructor() {
    this.memory = null;
    this.llm = new OpenRouterClient();
    this.client = null;
  }

  /**
   * Initialize Agent
   */
  async init() {
    console.log('🚀 Initializing Chat Agent...\n');

    // Connect to SeekDB
    this.client = await createClient();

    // Initialize memory system
    this.memory = new AgentMemory(this.client, 'chat_memory');
    await this.memory.init();

    const stats = await this.memory.stats();
    console.log(`📊 Memory stats: ${stats.totalMessages} messages stored\n`);

    console.log('✅ Agent ready!\n');
  }

  /**
   * Chat
   * @param {string} userMessage - User message
   * @returns {Promise<string>} - Agent response
   */
  async chat(userMessage) {
    console.log(`👤 User: ${userMessage}`);

    const isProfileQuery = /我(擅长|会|职业|工作|做什么|是什么|叫什么)/.test(userMessage);
    const recallOptions = isProfileQuery
      ? {
          strategy: 'limit',
          limit: 3,
          role: 'user',
        }
      : {
          strategy: 'threshold',
          threshold: 0.65,
          limit: 5,
          role: 'user',
        };

    // 1. Recall relevant historical memories
    const relevantHistory = await this.memory.recall(userMessage, recallOptions);

    console.log(`🧠 Recalled ${relevantHistory.length} relevant memories`);

    // 2. Build system prompt
    const systemPrompt = this._buildSystemPrompt(relevantHistory);

    // 3. Call LLM
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const response = await this.llm.chat(messages);

    // 4. Store conversation
    await this.memory.store('user', userMessage);
    await this.memory.store('assistant', response);

    console.log(`🤖 Assistant: ${response}\n`);

    return response;
  }

  /**
   * Build system prompt
   * @private
   */
  _buildSystemPrompt(relevantHistory) {
    if (relevantHistory.length === 0) {
      return 'You are a helpful AI assistant. Please answer user questions.';
    }

    const context = relevantHistory
      .map(h => `${h.role}: ${h.message}`)
      .join('\n');

    return `You are a helpful AI assistant. The following is relevant historical conversation context:

${context}

Please answer the user's new question based on the above context. If the context is irrelevant, ignore it.`;
  }

  /**
   * Demo scenarios
   */
  async runDemo() {
    await this.init();

    console.log('=== Demo 1: Personal Background ===');
    await this.chat('Hello, I am a programmer who loves coding');

    console.log('=== Demo 2: Related Question Recall ===');
    await this.chat('What am I good at?');

    console.log('=== Demo 3: Irrelevant Topic Filtering ===');
    await this.chat('How is the weather in Beijing?');

    // Final statistics
    const stats = await this.memory.stats();
    console.log(`\n📊 Final memory stats: ${stats.totalMessages} messages stored`);

    // Close connection
    await this.client.close();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new ChatAgent();
  agent.runDemo().catch(console.error);
}

export default ChatAgent;
