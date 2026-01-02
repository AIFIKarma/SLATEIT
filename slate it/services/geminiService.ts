
// Fix: Updated geminiService.ts to follow @google/genai guidelines and provide missing exports
import { GoogleGenAI, GenerateContentResponse, Type, Modality, Part, FunctionDeclaration } from "@google/genai";
import { SmartSequenceItem, VideoGenerationMode } from "../types";

// --- Initialization ---

// Guideline: Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const getClient = () => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing. Please select a paid API key via the Google AI Studio button.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const getErrorMessage = (error: any): string => {
    if (!error) return "Unknown error";
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (error.error && error.error.message) return error.error.message;
    return JSON.stringify(error);
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff<T>(
  operation: () => Promise<T>, 
  maxRetries: number = 3, 
  baseDelay: number = 2000
): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const msg = getErrorMessage(error).toLowerCase();
      const isOverloaded = error.status === 503 || error.code === 503 || msg.includes("overloaded") || msg.includes("429");

      if (isOverloaded && i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await wait(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// --- Image/Video Utilities ---

export const urlToBase64 = async (url: string): Promise<string> => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Failed to convert URL to Base64", e);
        return "";
    }
};

const convertImageToCompatibleFormat = async (base64Str: string): Promise<{ data: string, mimeType: string, fullDataUri: string }> => {
    if (base64Str.match(/^data:image\/(png|jpeg|jpg);base64,/)) {
        const match = base64Str.match(/^data:(image\/[a-zA-Z+]+);base64,/);
        const mimeType = match ? match[1] : 'image/png';
        const data = base64Str.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
        return { data, mimeType, fullDataUri: base64Str };
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error("Canvas context failed")); return; }
            ctx.drawImage(img, 0, 0);
            const pngDataUrl = canvas.toDataURL('image/png');
            const data = pngDataUrl.replace(/^data:image\/png;base64,/, "");
            resolve({ data, mimeType: 'image/png', fullDataUri: pngDataUrl });
        };
        img.onerror = (e) => reject(new Error("Image conversion failed for Veo compatibility"));
        img.src = base64Str;
    });
};

export const extractLastFrame = (videoSrc: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.crossOrigin = "anonymous"; 
        video.src = videoSrc;
        video.muted = true;
        video.onloadedmetadata = () => { video.currentTime = Math.max(0, video.duration - 0.1); };
        video.onseeked = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/png'));
                } else {
                    reject(new Error("Canvas context failed"));
                }
            } catch (e) { reject(e); } finally { video.remove(); }
        };
        video.onerror = () => { reject(new Error("Video load failed for frame extraction")); video.remove(); };
    });
};

// --- Video Generation ---

export const generateVideo = async (
    prompt: string, 
    model: string, 
    options: { aspectRatio?: string, count?: number, generationMode?: VideoGenerationMode, resolution?: string } = {}, 
    inputImageBase64?: string | null,
    videoInput?: any,
    referenceImages?: string[],
    lastFrameBase64?: string | null 
): Promise<{ uri: string, isFallbackImage?: boolean, videoMetadata?: any, uris?: string[] }> => {
    const ai = getClient();
    
    const qualitySuffix = ", cinematic lighting, highly detailed, photorealistic, 4k, smooth motion, professional color grading";
    const enhancedPrompt = prompt + qualitySuffix;
    
    let resolution = options.resolution || (model.includes('pro') ? '1080p' : '720p');

    // Prepare Inputs
    let inputs: any = { prompt: enhancedPrompt };
    
    // 1. Handle Start Frame
    if (inputImageBase64) {
        try {
            const compat = await convertImageToCompatibleFormat(inputImageBase64);
            inputs.image = { imageBytes: compat.data, mimeType: compat.mimeType };
        } catch (e) {
            console.warn("Veo Input Image Conversion Failed:", e);
        }
    }

    // 2. Build Config
    const config: any = {
        numberOfVideos: 1,
        aspectRatio: options.aspectRatio || '16:9',
        resolution: resolution as any
    };

    // 3. Handle End Frame
    if (lastFrameBase64) {
        try {
            const endCompat = await convertImageToCompatibleFormat(lastFrameBase64);
            config.lastFrame = { imageBytes: endCompat.data, mimeType: endCompat.mimeType };
        } catch (e) {
            console.warn("Veo End Frame Conversion Failed:", e);
        }
    }

    // 4. Handle Asset references
    if (referenceImages && referenceImages.length > 0 && model === 'veo-3.1-generate-preview') {
         const refsPayload = [];
         for (const ref of referenceImages) {
             const c = await convertImageToCompatibleFormat(ref);
             refsPayload.push({ image: { imageBytes: c.data, mimeType: c.mimeType }, referenceType: 'ASSET' });
         }
         config.referenceImages = refsPayload;
    }

    const count = options.count || 1;
    
    try {
        const operations = [];
        for (let i = 0; i < count; i++) {
             operations.push(retryWithBackoff(async () => {
                 let op = await ai.models.generateVideos({
                     model: model,
                     ...inputs,
                     config: config
                 });
                 
                 while (!op.done) {
                     await wait(10000);
                     op = await ai.operations.getVideosOperation({ operation: op });
                 }
                 return op;
             }));
        }

        const results = await Promise.allSettled(operations);
        const validUris: string[] = [];
        let primaryMetadata = null;

        for (const res of results) {
            if (res.status === 'fulfilled') {
                const vid = res.value.response?.generatedVideos?.[0]?.video;
                if (vid?.uri) {
                    const fullUri = `${vid.uri}&key=${process.env.API_KEY}`;
                    validUris.push(fullUri);
                    if (!primaryMetadata) primaryMetadata = vid;
                }
            }
        }

        if (validUris.length === 0) {
            const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
            throw firstError?.reason || new Error("Video generation failed.");
        }

        return { uri: validUris[0], uris: validUris, videoMetadata: primaryMetadata, isFallbackImage: false };

    } catch (e: any) {
        // Fallback to Image if video generation fails
        try {
            const fallbackPrompt = "Cinematic movie still, " + enhancedPrompt;
            const res = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [{ text: fallbackPrompt }] }
            });
            const imgPart = res.candidates[0].content.parts.find(p => p.inlineData);
            if (imgPart) {
                return { uri: `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`, isFallbackImage: true };
            }
            throw e;
        } catch (imgErr) {
            throw new Error(getErrorMessage(e));
        }
    }
};

export const generateImageFromText = async (prompt: string, model: string, inputImages: string[] = [], options: any = {}) => {
    const ai = getClient();
    const parts: Part[] = [];
    for (const base64 of inputImages) {
        try {
            const compat = await convertImageToCompatibleFormat(base64);
            parts.push({ inlineData: { data: compat.data, mimeType: compat.mimeType } });
        } catch (e) {
            console.warn("Input Image conversion failed", e);
        }
    }
    parts.push({ text: prompt });
    
    const response = await ai.models.generateContent({ 
        model: model.includes('pro') ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image', 
        contents: { parts },
        config: {
            imageConfig: {
                aspectRatio: options.aspectRatio || "1:1"
            }
        }
    });
    const images: string[] = [];
    if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
        }
    }
    return images;
};

export const analyzeVideo = async (videoBase64: string, prompt: string, model: string) => {
    const ai = getClient();
    const mime = videoBase64.match(/^data:(video\/\w+);base64,/)?.[1] || 'video/mp4';
    const data = videoBase64.replace(/^data:video\/\w+;base64,/, "");
    const response = await ai.models.generateContent({
        model: model || 'gemini-3-pro-preview',
        contents: { parts: [{ inlineData: { mimeType: mime, data } }, { text: prompt }] }
    });
    return response.text || "";
};

export const orchestrateVideoPrompt = async (images: string[], userPrompt: string): Promise<string> => {
     const ai = getClient();
     const parts: Part[] = [];
     for(const img of images) {
         try {
             const compat = await convertImageToCompatibleFormat(img);
             parts.push({ inlineData: { data: compat.data, mimeType: compat.mimeType } });
         } catch(e) {}
     }
     parts.push({ text: `Create a single video prompt that bridges these frames naturally. Starting from image 1 and ending at the last image. User Intent: ${userPrompt}` });
     const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: { parts } });
     return response.text || userPrompt;
};

export const editImageWithText = async (imageBase64: string, prompt: string, model: string) => {
     const imgs = await generateImageFromText(prompt, model, [imageBase64]);
     return imgs[0];
};

export const planStoryboard = async (prompt: string, context: string) => {
    const ai = getClient();
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        config: { 
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            }
        },
        contents: { parts: [{ text: `Create a cinematic storyboard array of detailed prompts for: ${prompt}. Context: ${context}` }] }
    });
    try { return JSON.parse(response.text || "[]"); } catch { return []; }
};

// Add sendChatMessage for AssistantPanel
export const sendChatMessage = async (history: any[], message: string, options: any = {}) => {
  const ai = getClient();
  const model = options.isThinkingMode ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
  
  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction: options.isStoryboard ? "You are a professional storyboard artist." : "You are a creative AI assistant for Slate it！",
      thinkingConfig: options.isThinkingMode ? { thinkingBudget: 32768 } : undefined
    }
  });

  const response = await chat.sendMessage({ message });
  return response.text || "";
};

// Update generateAudio to handle optional arguments and use TTS model
export const generateAudio = async (prompt: string, referenceAudio?: string, options: any = {}) => {
    const ai = getClient();
    let finalPrompt = prompt;
    if (options.emotion) {
        finalPrompt = `Say in a ${options.emotion.label || options.emotion} tone: ${prompt}`;
    }

    const voiceName = options.persona?.gender === 'Female' ? 'Puck' : 'Kore';

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: { parts: [{ text: finalPrompt }] },
        config: { 
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName }
                }
            }
        }
    });
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) throw new Error("Audio generation failed");
    return `data:audio/pcm;base64,${audioData}`;
};

// Implement connectLiveSession using Gemini Live API
export const connectLiveSession = async (onAudio: (pcm: string) => void, onClose: () => void) => {
  const ai = getClient();
  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks: {
      onopen: () => console.log('Live connected'),
      onmessage: async (message) => {
        const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (audio) onAudio(audio);
      },
      onclose: onClose,
      onerror: (e) => {
        console.error("Live API Error", e);
        onClose();
      }
    },
    config: {
      responseModalities: [Modality.AUDIO]
    }
  });
  return sessionPromise;
};

export const compileMultiFramePrompt = (frames: any[]) => "Cinematic sequence: " + frames.map(f => f.transition?.prompt).join(" -> ");
export const transcribeAudio = async (audio: string) => {
    const ai = getClient();
    const data = audio.replace(/^data:audio\/\w+;base64,/, "");
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
            parts: [
                { inlineData: { mimeType: 'audio/wav', data } },
                { text: "Transcribe this audio accurately." }
            ]
        }
    });
    return response.text || "";
}; 
