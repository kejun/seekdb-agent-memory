import { createEmbeddingFunction, getEmbeddingDimension } from '../config/database.js';

/**
 * Agent Memory Management Class
 * Implements vector storage and similarity-based recall using SeekDB
 */
export class AgentMemory {
  constructor(client, collectionName = 'chat_memory') {
    this.client = client;
    this.collectionName = collectionName;
    this.collection = null;
  }

  /**
   * Initialize collection
   */
  async init() {
    const embeddingFunction = createEmbeddingFunction();
    const embeddingDimension = getEmbeddingDimension();

    this.collection = await this.client.getOrCreateCollection({
      name: this.collectionName,
      configuration: {
        dimension: embeddingDimension,
        distance: 'cosine',  // Cosine similarity
      },
      embeddingFunction,
    });

    console.log(`Collection ready: ${this.collection.name}`);
  }

  /**
   * Store conversation to memory
   * @param {string} role - 'user' | 'assistant'
   * @param {string} message - Message content
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
   * Recall relevant historical memories
   * @param {string} query - Current query
   * @param {Object} options - Recall options
   * @returns {Promise<Array>} - Relevant historical messages
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
   * Threshold-based recall - Only return messages above similarity threshold
   * @private
   */
  async _recallByThreshold(query, threshold, options = {}) {
    const { where } = options;

    // Get more results first, then filter locally
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
      // Cosine distance to similarity: similarity = 1 - distance
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
   * Limit-based recall - Return top N most similar messages
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
   * Hybrid recall strategy - Threshold filter first, then limit quantity
   * @param {string} query - Query text
   * @param {Object} options - Options
   * @returns {Promise<Array>}
   */
  async recallHybrid(query, options = {}) {
    const { threshold = 0.6, limit = 10, where } = options;

    // Threshold recall first
    const thresholdResults = await this._recallByThreshold(query, threshold, { where, limit });

    // Then limit quantity
    return thresholdResults.slice(0, limit);
  }

  /**
   * Recall with time decay
   * @param {string} query - Query text
   * @param {Object} options - Options
   * @returns {Promise<Array>}
   */
  async recallWithTimeDecay(query, options = {}) {
    const { threshold = 0.6, hours = 24 } = options;

    // Get results filtered by time range
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
        // Calculate time decay weight
        const age = Date.now() - (metadatas[i]?.timestamp || 0);
        const hoursOld = age / (1000 * 60 * 60);
        const timeWeight = Math.exp(-hoursOld * 0.1);  // Decay coefficient 0.1

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

    // Sort by weighted score
    memories.sort((a, b) => b.weightedScore - a.weightedScore);

    return memories;
  }

  /**
   * Get statistics
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
   * Clear all memories
   */
  async clear() {
    if (!this.collection) {
      throw new Error('Collection not initialized.');
    }

    await this.client.deleteCollection(this.collectionName);
    await this.init();  // Re-initialize
  }
}

export default AgentMemory;
