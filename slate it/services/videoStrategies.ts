
import { AppNode, VideoGenerationMode } from '../types';
import { extractLastFrame, urlToBase64, analyzeVideo, orchestrateVideoPrompt, generateImageFromText } from './geminiService';

export interface StrategyResult {
    finalPrompt: string;
    videoInput: any;
    inputImageForGeneration: string | null;
    referenceImages: string[] | undefined;
    generationMode: VideoGenerationMode;
    lastFrameForGeneration?: string | null; // NEW
}

// --- Module: Default ---
export const processDefaultVideoGen = async (node: AppNode, inputs: AppNode[], prompt: string): Promise<StrategyResult> => {
    const imageInput = inputs.find(n => n.data.image || n.data.croppedFrame);
    return {
        finalPrompt: prompt,
        videoInput: null,
        inputImageForGeneration: imageInput?.data.croppedFrame || imageInput?.data.image || null,
        referenceImages: undefined,
        generationMode: 'DEFAULT'
    };
};

// --- Module: StoryContinuator (Continuation) ---
export const processStoryContinuator = async (node: AppNode, inputs: AppNode[], prompt: string): Promise<StrategyResult> => {
    let lastFrame: string | null = null;
    const videoNode = inputs.find(n => n.data.videoUri);
    if (videoNode && videoNode.data.videoUri) {
         try {
             let videoSrc = videoNode.data.videoUri;
             if (videoSrc.startsWith('http')) videoSrc = await urlToBase64(videoSrc);
             lastFrame = await extractLastFrame(videoSrc);
         } catch (e) { console.warn(e); }
    }
    return {
        finalPrompt: prompt,
        videoInput: null,
        inputImageForGeneration: lastFrame,
        referenceImages: undefined,
        generationMode: 'CONTINUE'
    };
};

// --- Module: FrameWeaver (First + Last Frame) ---
export const processFrameWeaver = async (node: AppNode, inputs: AppNode[], prompt: string): Promise<StrategyResult> => {
    // 识别所有具有图像的输入节点
    const images: string[] = inputs.map(n => n.data.image || n.data.croppedFrame).filter(Boolean) as string[];

    let startFrame = images[0] || null;
    let endFrame = images[1] || null;
    let finalPrompt = prompt;

    if (images.length >= 2) {
        try { 
            // 利用 Gemini 桥接首尾帧的提示词
            finalPrompt = await orchestrateVideoPrompt([startFrame!, endFrame!], prompt); 
        } catch (e) { console.warn(e); }
    }

    return {
        finalPrompt,
        videoInput: null,
        inputImageForGeneration: startFrame,
        lastFrameForGeneration: endFrame, // 关键：传递结束帧
        referenceImages: undefined,
        generationMode: 'FIRST_LAST_FRAME'
    };
};

// --- Module: SceneDirector (Crop + Style) ---
export const processSceneDirector = async (node: AppNode, inputs: AppNode[], prompt: string): Promise<StrategyResult> => {
    const crop = node.data.croppedFrame || inputs.find(n => n.data.croppedFrame)?.data.croppedFrame;
    return {
        finalPrompt: prompt,
        videoInput: null,
        inputImageForGeneration: crop || null,
        referenceImages: undefined,
        generationMode: 'CUT'
    };
};

// --- Module: CharacterRef ---
export const processCharacterRef = async (node: AppNode, inputs: AppNode[], prompt: string): Promise<StrategyResult> => {
    const characterImage = inputs.find(n => n.data.image)?.data.image || null;
    return {
        finalPrompt: prompt,
        videoInput: null,
        inputImageForGeneration: characterImage,
        referenceImages: undefined,
        generationMode: 'CHARACTER_REF'
    };
};

// --- Main Factory ---
export const getGenerationStrategy = async (node: AppNode, inputs: AppNode[], basePrompt: string): Promise<StrategyResult> => {
    const mode = node.data.generationMode || 'DEFAULT';
    switch (mode) {
        case 'CHARACTER_REF': return processCharacterRef(node, inputs, basePrompt);
        case 'FIRST_LAST_FRAME': return processFrameWeaver(node, inputs, basePrompt);
        case 'CUT': return processSceneDirector(node, inputs, basePrompt);
        case 'CONTINUE': return processStoryContinuator(node, inputs, basePrompt);
        default: return processDefaultVideoGen(node, inputs, basePrompt);
    }
};
