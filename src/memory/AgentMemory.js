import { createEmbeddingFunction, getEmbeddingDimension } from '../config/database.js';

/**
 * Agent 记忆管理类
 * 基于 SeekDB 实现向量存储和相似度召回
 */
export class AgentMemory {
  constructor(client, collectionName = 'chat_memory') {
    this.client = client;
    this.collectionName = collectionName;
    this.collection = null;
  }

  /**
   * 初始化集合
   */
  async init() {
    const embeddingFunction = createEmbeddingFunction();
    const embeddingDimension = getEmbeddingDimension();

    this.collection = await this.client.getOrCreateCollection({
      name: this.collectionName,
      configuration: {
        dimension: embeddingDimension,
        distance: 'cosine',  // 余弦相似度
      },
      embeddingFunction,
    });

    console.log(`Collection ready: ${this.collection.name}`);
  }

  /**
   * 存储对话到记忆
   * @param {string} role - 'user' | 'assistant'
   * @param {string} message - 消息内容
   * @returns {Promise<void>}
   */
  async store(role, message) {
    if (!this.collection) {
      throw new Error('Collection not initialized. Call init() first.');
    }

    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await this.collection.add({
      ids: id,
      documents: message,
      metadatas: {
        role,
        timestamp: Date.now(),
      },
    });

    console.log(`Stored: [${role}] ${message.substring(0, 50)}...`);
  }

  /**
   * 召回相关历史记忆
   * @param {string} query - 当前查询
   * @param {Object} options - 召回选项
   * @returns {Promise<Array>} - 相关历史消息
   */
  async recall(query, options = {}) {
    if (!this.collection) {
      throw new Error('Collection not initialized. Call init() first.');
    }

    const {
      strategy = 'threshold',  // 'threshold' | 'limit' | 'hybrid'
      threshold = 0.75,
      limit = 5,
      role,
    } = options;

    const where = role ? { role } : undefined;

    switch (strategy) {
      case 'threshold':
        return this._recallByThreshold(query, threshold, { where, limit });
      case 'limit':
        return this._recallByLimit(query, limit, { where });
      case 'hybrid':
        return this.recallHybrid(query, { threshold, limit, where });
      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  /**
   * 阈值召回 - 只返回相似度超过阈值的消息
   * @private
   */
  async _recallByThreshold(query, threshold, options = {}) {
    const { where } = options;

    // 先获取更多结果，然后本地过滤
    const results = await this.collection.query({
      queryTexts: query,
      where,
      nResults: 50,
    });

    const memories = [];
    const ids = results.ids[0];
    const documents = results.documents[0];
    const distances = results.distances?.[0] || [];
    const metadatas = results.metadatas?.[0] || [];

    for (let i = 0; i < ids.length; i++) {
      // 余弦距离转相似度: similarity = 1 - distance
      const similarity = 1 - (distances[i] || 0);

      if (similarity >= threshold) {
        memories.push({
          id: ids[i],
          role: metadatas[i]?.role || 'unknown',
          message: documents[i],
          similarity: parseFloat(similarity.toFixed(4)),
          timestamp: metadatas[i]?.timestamp,
        });
      }
    }

    return memories;
  }

  /**
   * 固定数量召回 - 返回最相似的 N 条
   * @private
   */
  async _recallByLimit(query, limit, options = {}) {
    const { where } = options;

    const results = await this.collection.query({
      queryTexts: query,
      where,
      nResults: limit,
    });

    const memories = [];
    const ids = results.ids[0];
    const documents = results.documents[0];
    const distances = results.distances?.[0] || [];
    const metadatas = results.metadatas?.[0] || [];

    for (let i = 0; i < ids.length; i++) {
      const similarity = 1 - (distances[i] || 0);

      memories.push({
        id: ids[i],
        role: metadatas[i]?.role || 'unknown',
        message: documents[i],
        similarity: parseFloat(similarity.toFixed(4)),
        timestamp: metadatas[i]?.timestamp,
      });
    }

    return memories;
  }

  /**
   * 混合召回策略 - 先阈值筛选，再限制数量
   * @param {string} query - 查询文本
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async recallHybrid(query, options = {}) {
    const { threshold = 0.6, limit = 10, where } = options;

    // 先按阈值召回
    const thresholdResults = await this._recallByThreshold(query, threshold, { where, limit });

    // 再限制数量
    return thresholdResults.slice(0, limit);
  }

  /**
   * 带时间衰减的召回
   * @param {string} query - 查询文本
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async recallWithTimeDecay(query, options = {}) {
    const { threshold = 0.6, hours = 24 } = options;

    // 获取时间范围过滤的结果
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;

    const results = await this.collection.query({
      queryTexts: query,
      where: {
        timestamp: { $gte: cutoffTime },
      },
      nResults: 50,
    });

    const memories = [];
    const ids = results.ids[0];
    const documents = results.documents[0];
    const distances = results.distances?.[0] || [];
    const metadatas = results.metadatas?.[0] || [];

    for (let i = 0; i < ids.length; i++) {
      const similarity = 1 - (distances[i] || 0);

      if (similarity >= threshold) {
        // 计算时间衰减权重
        const age = Date.now() - (metadatas[i]?.timestamp || 0);
        const hoursOld = age / (1000 * 60 * 60);
        const timeWeight = Math.exp(-hoursOld * 0.1);  // 衰减系数 0.1

        memories.push({
          id: ids[i],
          role: metadatas[i]?.role || 'unknown',
          message: documents[i],
          similarity: parseFloat(similarity.toFixed(4)),
          timeWeight: parseFloat(timeWeight.toFixed(4)),
          weightedScore: parseFloat((similarity * timeWeight).toFixed(4)),
          timestamp: metadatas[i]?.timestamp,
        });
      }
    }

    // 按加权分数排序
    memories.sort((a, b) => b.weightedScore - a.weightedScore);

    return memories;
  }

  /**
   * 获取统计信息
   * @returns {Promise<Object>}
   */
  async stats() {
    if (!this.collection) {
      throw new Error('Collection not initialized.');
    }

    const count = await this.collection.count();
    const info = await this.collection.describe();

    return {
      totalMessages: count,
      dimension: info.dimension,
      distance: info.distance,
      name: info.name,
    };
  }

  /**
   * 清空记忆
   */
  async clear() {
    if (!this.collection) {
      throw new Error('Collection not initialized.');
    }

    await this.client.deleteCollection(this.collectionName);
    await this.init();  // 重新初始化
  }
}

export default AgentMemory;
