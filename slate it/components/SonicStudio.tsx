
// Fix: Updated SonicStudio.tsx to resolve argument count mismatch for generateAudio and fix type error for sendRealtimeInput
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
    X, Play, Pause, Download, Mic2, Disc, Wand2, Volume2, 
    Search, Heart, MoreHorizontal, Loader2, Sparkles, Upload, FileAudio, User, Smile,
    FileText, MessageCircle, Activity, AudioLines
} from 'lucide-react';
import { generateAudio, transcribeAudio, connectLiveSession } from '../services/geminiService';

interface SonicStudioProps {
    isOpen: boolean;
    onClose: () => void;
    history: any[]; 
    onGenerate: (src: string, prompt: string, duration: number) => void;
}

type TabMode = 'factory' | 'transcribe' | 'live';

const VOICE_PERSONAS = [
    { label: '深沉叙述 (Narrator)', desc: 'Deep, resonant male voice, slow pacing, storytelling style.', gender: 'Male' },
    { label: '活力解说 (Energetic)', desc: 'High energy, fast paced, enthusiastic YouTuber style.', gender: 'Any' },
    { label: '知性新闻 (News)', desc: 'Professional, articulate, neutral tone, broadcast standard.', gender: 'Female' },
    { label: '动漫少女 (Anime)', desc: 'High pitched, cute, expressive, "kawaii" aesthetic.', gender: 'Female' },
    { label: '电影旁白 (Epic)', desc: 'Gravelly, dramatic, movie trailer voice, intense.', gender: 'Male' },
    { label: '慈祥长者 (Elder)', desc: 'Warm, shaky, wise, slow speaking grandmother/grandfather.', gender: 'Any' },
];

const EMOTIONS = [
    { label: '默认 (Neutral)', value: 'neutral' },
    { label: '开心 (Happy)', value: 'cheerful and excited' },
    { label: '悲伤 (Sad)', value: 'melancholic and tearful' },
    { label: '愤怒 (Angry)', value: 'furious and shouting' },
    { label: '耳语 (Whisper)', value: 'whispering quietly' },
    { label: '恐惧 (Scared)', value: 'trembling and fearful' },
];

const PRESET_COVERS = [
    'from-pink-500 to-rose-500',
    'from-cyan-500 to-blue-500', 
    'from-purple-500 to-indigo-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
    'from-slate-700 to-slate-900',
];

const decodeAudioData = async (base64PCM: string, ctx: AudioContext) => {
    const binaryString = atob(base64PCM);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
    }
    
    const buffer = ctx.createBuffer(1, float32.length, 24000); 
    buffer.copyToChannel(float32, 0);
    return buffer;
};

const convertFloat32ToInt16PCM = (float32: Float32Array) => {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
};

export const SonicStudio: React.FC<SonicStudioProps> = ({ isOpen, onClose, history, onGenerate }) => {
    const [activeTab, setActiveTab] = useState<TabMode>('factory');
    const [textPrompt, setTextPrompt] = useState('');
    const [selectedPersona, setSelectedPersona] = useState<any>(null);
    const [selectedEmotion, setSelectedEmotion] = useState(EMOTIONS[0]);
    const [referenceAudio, setReferenceAudio] = useState<string | null>(null);
    const [referenceFileName, setReferenceFileName] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [transcribeFile, setTranscribeFile] = useState<string | null>(null);
    const [transcribeFileName, setTranscribeFileName] = useState<string | null>(null);
    const [transcript, setTranscript] = useState('');
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isLiveActive, setIsLiveActive] = useState(false);
    const [liveStatus, setLiveStatus] = useState("Ready");
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const nextStartTimeRef = useRef(0);
    const sessionRef = useRef<any>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [currentTrack, setCurrentTrack] = useState<any>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(0.8);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const transcribeInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (currentTrack && audioRef.current) {
            audioRef.current.src = currentTrack.src;
            audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
    }, [currentTrack]);

    const togglePlay = () => {
        if (!audioRef.current || !currentTrack) return;
        if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
        else { audioRef.current.play(); setIsPlaying(true); }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) { setCurrentTime(audioRef.current.currentTime); setDuration(audioRef.current.duration || 0); }
    };

    const handleUploadSample = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setReferenceFileName(file.name);
            const reader = new FileReader();
            reader.onload = (ev) => setReferenceAudio(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleGenerateClick = async () => {
        if (!textPrompt.trim() || isGenerating) return;
        setIsGenerating(true);
        try {
            const audioUri = await generateAudio(textPrompt, referenceAudio || undefined, { persona: selectedPersona, emotion: selectedEmotion });
            onGenerate(audioUri, textPrompt, 0); 
            setCurrentTrack({ id: `temp-${Date.now()}`, src: audioUri, title: textPrompt.substring(0, 30), timestamp: Date.now() });
        } catch (e) { console.error(e); } finally { setIsGenerating(false); }
    };

    const handleUploadTranscribe = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setTranscribeFileName(file.name);
            const reader = new FileReader();
            reader.onload = (ev) => setTranscribeFile(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleTranscribeClick = async () => {
        if (!transcribeFile || isTranscribing) return;
        setIsTranscribing(true);
        try { const text = await transcribeAudio(transcribeFile); setTranscript(text); }
        catch (e) { console.error(e); } finally { setIsTranscribing(false); }
    };

    const startLive = async () => {
        try {
            setLiveStatus("Connecting...");
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            setAudioContext(ctx);
            nextStartTimeRef.current = 0;

            const sessionPromise = connectLiveSession(
                async (pcmBase64) => {
                    if (ctx.state === 'suspended') await ctx.resume();
                    const buffer = await decodeAudioData(pcmBase64, ctx);
                    const source = ctx.createBufferSource();
                    source.buffer = buffer;
                    source.connect(ctx.destination);
                    const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
                    source.start(startTime);
                    nextStartTimeRef.current = startTime + buffer.duration;
                },
                () => stopLive()
            );
            
            const session = await sessionPromise;
            sessionRef.current = session;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const source = ctx.createMediaStreamSource(stream);
            const processor = ctx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;
            
            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmInt16 = convertFloat32ToInt16PCM(inputData);
                const base64 = arrayBufferToBase64(pcmInt16.buffer);
                
                if (sessionRef.current) {
                    sessionRef.current.sendRealtimeInput({
                        media: { mimeType: 'audio/pcm;rate=16000', data: base64 }
                    });
                }
            };

            source.connect(processor);
            const mute = ctx.createGain(); mute.gain.value = 0;
            processor.connect(mute); mute.connect(ctx.destination);

            setLiveStatus("Connected");
            setIsLiveActive(true);
        } catch (e) { stopLive(); }
    };

    const stopLive = () => {
        if (processorRef.current) processorRef.current.disconnect();
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        if (audioContext) audioContext.close();
        setIsLiveActive(false); setLiveStatus("Ready");
    };

    const toggleLive = () => { if (isLiveActive) stopLive(); else startLive(); };

    return (
        <div className={`fixed inset-0 z-[100] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] bg-[#0a0a0c] flex ${isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10 pointer-events-none'}`}>
            <div className="w-64 h-full border-r border-white/5 bg-[#121214] flex flex-col z-10">
                <div className="h-16 flex items-center px-6 border-b border-white/5 gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg"><AudioLines size={16} className="text-white" /></div>
                    <span className="text-sm font-bold tracking-wide text-white">Audio Hub</span>
                </div>
                <div className="flex flex-col gap-1 p-4">
                    <button onClick={() => setActiveTab('factory')} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'factory' ? 'bg-white/10 text-white shadow-md' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><Mic2 size={16} /> 声音工厂</button>
                    <button onClick={() => setActiveTab('transcribe')} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'transcribe' ? 'bg-white/10 text-white shadow-md' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><FileText size={16} /> 转录</button>
                    <button onClick={() => setActiveTab('live')} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'live' ? 'bg-white/10 text-white shadow-md' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><MessageCircle size={16} /> 实时对话</button>
                </div>
            </div>
            <div className="flex-1 flex flex-col relative">
                <div className="absolute top-6 left-6 flex items-center gap-4 z-20"><button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"><X size={20} /></button></div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pb-32">
                    {activeTab === 'factory' && ( <div className="max-w-5xl mx-auto flex flex-col gap-8"> <h1 className="text-3xl font-black text-white">声音工厂</h1> <div className="grid grid-cols-3 gap-6"> <div className="col-span-1 space-y-6"> <div className="h-32 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center cursor-pointer" onClick={() => fileInputRef.current?.click()}> <input type="file" ref={fileInputRef} className="hidden" onChange={handleUploadSample}/> <span className="text-xs text-slate-500">{referenceFileName || '上传参考音频'}</span> </div> <div className="grid grid-cols-2 gap-2"> {EMOTIONS.map(e => <button key={e.value} onClick={() => setSelectedEmotion(e)} className={`px-3 py-2 rounded-lg text-xs ${selectedEmotion.value === e.value ? 'bg-cyan-500 text-black' : 'bg-white/5 text-slate-400'}`}>{e.label}</button>)} </div> </div> <div className="col-span-2 flex flex-col gap-6"> <textarea className="w-full flex-1 bg-white/5 border border-white/10 rounded-2xl p-5 text-slate-200 outline-none min-h-[200px]" value={textPrompt} onChange={e => setTextPrompt(e.target.value)} placeholder="输入文本..."/> <button onClick={handleGenerateClick} className="self-end px-8 py-3 bg-cyan-500 text-black rounded-xl font-bold">{isGenerating ? '...' : '生成'}</button> </div> </div> </div> )}
                    {activeTab === 'transcribe' && ( <div className="max-w-5xl mx-auto flex flex-col gap-8"> <h1 className="text-3xl font-black text-white">转录</h1> <div className="h-40 rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-4 cursor-pointer" onClick={() => transcribeInputRef.current?.click()}> <input type="file" ref={transcribeInputRef} className="hidden" onChange={handleUploadTranscribe}/> <span>{transcribeFileName || '选择音频'}</span> </div> <button onClick={handleTranscribeClick} className="px-8 py-3 bg-cyan-500 text-black rounded-full font-bold self-center">开始</button> {transcript && <div className="p-6 bg-white/5 rounded-2xl text-slate-300">{transcript}</div>} </div> )}
                    {activeTab === 'live' && ( <div className="flex flex-col items-center gap-10 py-10"> <h1 className="text-3xl font-black text-white">实时对话</h1> <div className={`w-48 h-48 rounded-full border-4 flex flex-col items-center justify-center ${isLiveActive ? 'border-cyan-500 animate-pulse' : 'border-white/10'}`}> <Activity size={48} /> <span>{liveStatus}</span> </div> <button onClick={toggleLive} className={`px-10 py-4 rounded-full font-bold ${isLiveActive ? 'bg-red-500' : 'bg-cyan-500 text-black'}`}>{isLiveActive ? '结束' : '开始'}</button> </div> )}
                </div>
                {currentTrack && activeTab !== 'live' && ( <div className="h-24 bg-[#121214] border-t border-white/5 flex items-center px-8 gap-8"> <div className="flex items-center gap-4 w-64"> <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center"><Mic2 size={20}/></div> <div> <div className="text-sm font-bold text-white truncate">{currentTrack.title}</div> <div className="text-[10px] text-slate-500">Audio Hub</div> </div> </div> <div className="flex-1 flex flex-col items-center gap-2"> <button onClick={togglePlay} className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center">{isPlaying ? <Pause size={20}/> : <Play size={20} className="ml-1"/>}</button> <div className="w-full h-1 bg-white/10 rounded-full"><div className="h-full bg-cyan-500" style={{ width: `${(currentTime/duration)*100}%` }}/></div> </div> <div className="w-64 flex justify-end"><Volume2 size={20}/></div> <audio ref={audioRef} onTimeUpdate={handleTimeUpdate} onEnded={() => setIsPlaying(false)}/> </div> )}
            </div>
        </div>
    );
};
