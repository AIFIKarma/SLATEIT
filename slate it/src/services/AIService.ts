export interface AIConfig {
  baseUrl: string;
  apiKey: string;
}

export interface ModelCategory {
  text: string[];
  image: string[];
  video: string[];
}

// --- CONSTANTS: Easily configurable paths ---
// You can modify these if your relay service uses different paths
const API_PATHS = {
  MODELS: '/v1/models',
  CHAT: '/v1/chat/completions',
  IMAGE: '/v1/images/generations',
  VIDEO: '/v1/videos/generations', // Compatible with Luma/Runway/OneAPI standards
};

const STORAGE_KEY = 'kaka_ai_config';

const DEFAULT_MODELS: ModelCategory = {
  text: ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro'],
  image: ['dall-e-3', 'midjourney'],
  video: ['luma-dream-machine', 'runway-gen-3', 'kling-v1', 'wan-2.1'],
};

class AIService {
  private config: AIConfig = {
    baseUrl: 'https://api.openai.com', 
    apiKey: '',
  };

  private availableModels: ModelCategory = DEFAULT_MODELS;

  constructor() {
    this.loadConfig();
  }

  // --- 1. BYOK: Configuration Management ---

  public loadConfig() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.config = { ...this.config, ...parsed };
      } catch (e) {
        console.error('Failed to parse AI config', e);
      }
    }
  }

  public saveConfig(newConfig: Partial<AIConfig>) {
    this.config = { ...this.config, ...newConfig };
    // Ensure Base URL doesn't have trailing slash for consistency
    if (this.config.baseUrl.endsWith('/')) {
      this.config.baseUrl = this.config.baseUrl.slice(0, -1);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
  }

  public getConfig(): AIConfig {
    return { ...this.config };
  }

  public getModels(): ModelCategory {
    return this.availableModels;
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
  }

  // --- 2. Model Steward: Auto-fetch and Sort ---

  public async fetchModels(): Promise<ModelCategory> {
    if (!this.config.apiKey) return DEFAULT_MODELS;

    try {
      const response = await fetch(`${this.config.baseUrl}${API_PATHS.MODELS}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) throw new Error(`Fetch models failed: ${response.statusText}`);

      const data = await response.json();
      const rawList = data.data || []; // Standard OpenAI format

      // "The Sorting Hat" Algorithm
      const sorted: ModelCategory = { text: [], image: [], video: [] };

      rawList.forEach((item: any) => {
        const id = item.id.toLowerCase();
        
        // Video classifiers
        if (id.includes('wan') || id.includes('sora') || id.includes('luma') || id.includes('runway') || id.includes('video') || id.includes('svd') || id.includes('kling') || id.includes('hailuo')) {
          sorted.video.push(item.id);
        }
        // Image classifiers
        else if (id.includes('dall-e') || id.includes('mj') || id.includes('midjourney') || id.includes('flux') || id.includes('sdxl') || id.includes('image')) {
          sorted.image.push(item.id);
        }
        // Text/Chat classifiers (Default fallback)
        else {
          sorted.text.push(item.id);
        }
      });

      this.availableModels = sorted;
      return sorted;
    } catch (error) {
      console.error('Model Steward Error:', error);
      // Return currently cached or default models on error, don't crash app
      return this.availableModels.text.length > 0 ? this.availableModels : DEFAULT_MODELS;
    }
  }

  // --- 3. Node Generation Flows ---

  // Text Node Logic (Chat Completion)
  public async generateText(prompt: string, model: string, systemPrompt?: string): Promise<string> {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${this.config.baseUrl}${API_PATHS.CHAT}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Text API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // Image Node Logic
  public async generateImage(prompt: string, model: string): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}${API_PATHS.IMAGE}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: '1024x1024',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Image API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.data?.[0]?.url || ''; 
  }

  // Video Node Logic
  public async generateVideo(prompt: string, model: string, imageUrl?: string): Promise<string> {
    const payload: any = {
      model,
      prompt,
    };

    // If it's an image-to-video task
    if (imageUrl) {
      payload.image_url = imageUrl;
    }

    const response = await fetch(`${this.config.baseUrl}${API_PATHS.VIDEO}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Video API Error: ${response.status}`);
    }

    const data = await response.json();
    
    // Handle generic "id" return (Async) vs "url" return (Sync/Mock)
    if ((data.id || data.task_id) && !data.data && !data.url) {
        throw new Error("Task submitted (Async). Polling not implemented in MVP. Check your dashboard.");
    }

    // Attempt to find URL in common fields
    return data.data?.[0]?.url || data.url || data.video_url || '';
  }

  // --- 4. Balance Query ---
  public async fetchBalance(): Promise<{ amount: number; currency: string } | null> {
    if (!this.config.apiKey) return null;

    try {
      // Try standard OpenAI billing endpoint first
      let response = await fetch(`${this.config.baseUrl}/v1/dashboard/billing/usage`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      // If that fails, try common relay endpoints
      if (!response.ok) {
        response = await fetch(`${this.config.baseUrl}/curr_balance`, {
          method: 'GET',
          headers: this.getHeaders(),
        });
      }

      // Try another common endpoint
      if (!response.ok) {
        response = await fetch(`${this.config.baseUrl}/v1/dashboard/billing/subscription`, {
          method: 'GET',
          headers: this.getHeaders(),
        });
      }

      if (!response.ok) {
        throw new Error(`Balance API Error: ${response.status}`);
      }

      const data = await response.json();
      
      // Handle different response formats
      // Format 1: OpenAI style { total_usage: 0.5, total_granted: 20 }
      if (data.total_granted !== undefined) {
        const remaining = data.total_granted - (data.total_used || 0);
        return { amount: remaining, currency: 'USD' };
      }
      
      // Format 2: Direct balance { balance: 15.20, currency: 'USD' }
      if (data.balance !== undefined) {
        return { amount: data.balance, currency: data.currency || 'USD' };
      }
      
      // Format 3: Points style { points: 820000 }
      if (data.points !== undefined) {
        return { amount: data.points, currency: 'pts' };
      }
      
      // Format 4: Credits style { credits: 150 }
      if (data.credits !== undefined) {
        return { amount: data.credits, currency: 'credits' };
      }

      return null;
    } catch (error) {
      console.error('Balance fetch error:', error);
      return null;
    }
  }
}

export const aiService = new AIService();
