
// Fix: App.tsx restored to a complete module to fix fragment errors and provide missing variables
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Node } from './components/Node';
import { SidebarDock } from './components/SidebarDock';
import { AssistantPanel } from './components/AssistantPanel';
import { ImageCropper } from './components/ImageCropper';
import { SketchEditor } from './components/SketchEditor'; 
import { SmartSequenceDock } from './components/SmartSequenceDock';
import { SonicStudio } from './components/SonicStudio'; 
import { SettingsModal } from './components/SettingsModal';
import { AppNode, NodeType, NodeStatus, Connection, ContextMenuState, Group, Workflow, SmartSequenceItem } from './types';
import { generateImageFromText, generateVideo, analyzeVideo, editImageWithText, planStoryboard, orchestrateVideoPrompt, compileMultiFramePrompt, urlToBase64, extractLastFrame, generateAudio } from './services/geminiService';
import { getGenerationStrategy } from './services/videoStrategies';
import { saveToStorage, loadFromStorage } from './services/storage';
import { aiService, ModelCategory } from './src/services/AIService';
import { modelsConfig } from './config';
import { 
    Plus, Copy, Trash2, Type, Image as ImageIcon, Video as VideoIcon, 
    ScanFace, Brush, MousePointerClick, X, Film, Link, RefreshCw,
    Minus, FolderHeart, Unplug, Scan, Mic2, Loader2, ChevronLeft, ChevronRight,
    Upload, FolderPlus, Undo2, Redo2, Clipboard, House, Search, ArrowUpDown,
    ZoomIn, ZoomOut, HelpCircle, Info
} from 'lucide-react';

const SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";
const SNAP_THRESHOLD = 8; 
const COLLISION_PADDING = 24; 

const ExpandedView = ({ media, onClose }: { media: any, onClose: () => void }) => {
    const [visible, setVisible] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
    const [isLoadingVideo, setIsLoadingVideo] = useState(false);
    
    useEffect(() => {
        if (media) {
            requestAnimationFrame(() => setVisible(true));
            setCurrentIndex(media.initialIndex || 0);
        } else {
            setVisible(false);
        }
    }, [media]);

    const handleClose = useCallback(() => {
        setVisible(false);
        setTimeout(onClose, 400);
    }, [onClose]);

    const hasMultiple = media?.images && media.images.length > 1;

    const handleNext = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (hasMultiple) {
            setCurrentIndex((prev) => (prev + 1) % media.images.length);
        }
    }, [hasMultiple, media]);

    const handlePrev = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (hasMultiple) {
            setCurrentIndex((prev) => (prev - 1 + media.images.length) % media.images.length);
        }
    }, [hasMultiple, media]);

    useEffect(() => {
        if (!visible) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [visible, handleClose, handleNext, handlePrev]);

    useEffect(() => {
        if (!media) return;
        const currentSrc = hasMultiple ? media.images[currentIndex] : media.src;
        const isVideo = (media.type === 'video') && !(currentSrc && currentSrc.startsWith('data:image'));

        if (isVideo) {
            if (currentSrc.startsWith('blob:') || currentSrc.startsWith('data:')) {
                setVideoBlobUrl(currentSrc);
                return;
            }
            setIsLoadingVideo(true);
            let active = true;
            fetch(currentSrc)
                .then(res => res.blob())
                .then(blob => {
                    if (active) {
                        const mp4Blob = new Blob([blob], { type: 'video/mp4' });
                        setVideoBlobUrl(URL.createObjectURL(mp4Blob));
                        setIsLoadingVideo(false);
                    }
                })
                .catch(() => { if (active) setIsLoadingVideo(false); });
            return () => { active = false; };
        } else {
            setVideoBlobUrl(null);
        }
    }, [media, currentIndex, hasMultiple]);


    if (!media) return null;
    
    const currentSrc = hasMultiple ? media.images[currentIndex] : media.src;
    const isVideo = (media.type === 'video') && !(currentSrc && currentSrc.startsWith('data:image'));

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-500 ease-[${SPRING}] ${visible ? 'bg-black/90 backdrop-blur-xl' : 'bg-transparent pointer-events-none opacity-0'}`} onClick={handleClose}>
             <div className={`relative w-full h-full flex items-center justify-center p-8 transition-all duration-500 ease-[${SPRING}] ${visible ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`} onClick={e => e.stopPropagation()}>
                {hasMultiple && (
                    <button onClick={handlePrev} className="absolute left-4 md:left-8 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-all hover:scale-110 z-[110]"><ChevronLeft size={32} /></button>
                )}
                <div className="relative max-w-full max-h-full flex flex-col items-center">
                    {!isVideo ? (
                        <img key={currentSrc} src={currentSrc} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl animate-in fade-in duration-300 bg-[#0a0a0c]" draggable={false} />
                    ) : (
                        isLoadingVideo || !videoBlobUrl ? (
                            <div className="w-[60vw] h-[40vh] flex items-center justify-center bg-black/50 rounded-lg"><Loader2 className="animate-spin text-white" size={48} /></div>
                        ) : (
                            <video key={videoBlobUrl} src={videoBlobUrl} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl animate-in fade-in duration-300 bg-black" controls autoPlay playsInline />
                        )
                    )}
                    {hasMultiple && (
                        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex gap-2">
                            {media.images.map((_:any, i:number) => (
                                <div key={i} onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); }} className={`w-2.5 h-2.5 rounded-full cursor-pointer transition-all ${i === currentIndex ? 'bg-cyan-500 scale-125' : 'bg-white/30 hover:bg-white/50'}`} />
                            ))}
                        </div>
                    )}
                </div>
                {hasMultiple && (
                    <button onClick={handleNext} className="absolute right-4 md:right-8 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-all hover:scale-110 z-[110]"><ChevronRight size={32} /></button>
                )}
             </div>
             <button onClick={handleClose} className="absolute top-6 left-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-colors z-[110]"><X size={24} /></button>
        </div>
    );
};

export const App = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]); 
  const [assetHistory, setAssetHistory] = useState<any[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false); 
  const [isSketchEditorOpen, setIsSketchEditorOpen] = useState(false);
  const [isMultiFrameOpen, setIsMultiFrameOpen] = useState(false);
  const [isSonicStudioOpen, setIsSonicStudioOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [nodes, setNodes] = useState<AppNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [clipboard, setClipboard] = useState<AppNode | null>(null); 
  const [history, setHistory] = useState<any[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]); 
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [draggingNodeParentGroupId, setDraggingNodeParentGroupId] = useState<string | null>(null);
  const [draggingGroup, setDraggingGroup] = useState<any>(null); 
  const [resizingGroupId, setResizingGroupId] = useState<string | null>(null);
  const [activeGroupNodeIds, setActiveGroupNodeIds] = useState<string[]>([]);
  const [connectionStart, setConnectionStart] = useState<{ id: string, x: number, y: number, type: 'input' | 'output', nodeX: number, nodeY: number } | null>(null);
  const [connectionEnd, setConnectionEnd] = useState<{ x: number, y: number } | null>(null);
  const [hoveredPort, setHoveredPort] = useState<{ id: string, type: 'input' | 'output' } | null>(null);
  const [connectionMenu, setConnectionMenu] = useState<{ x: number, y: number, fromId: string } | null>(null);
  const [selectionRect, setSelectionRect] = useState<any>(null);
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
  const [showClearCanvasConfirm, setShowClearCanvasConfirm] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'home' | 'canvas' | 'projects'>('home');
  const [isClapperClosing, setIsClapperClosing] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectSearchQuery, setProjectSearchQuery] = useState<string>('');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState<string>('');
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);
  const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
  const [initialSize, setInitialSize] = useState<{width: number, height: number} | null>(null);
  const [resizeStartPos, setResizeStartPos] = useState<{x: number, y: number} | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextMenuTarget, setContextMenuTarget] = useState<any>(null);
  const [expandedMedia, setExpandedMedia] = useState<any>(null);
  const [croppingNodeId, setCroppingNodeId] = useState<string | null>(null);
  
  // AIService state
  const [aiConfig, setAiConfig] = useState(aiService.getConfig());
  const [aiModels, setAiModels] = useState<ModelCategory>(aiService.getModels());
  const [loadingAiModels, setLoadingAiModels] = useState(false);
  const [isApiSettingsOpen, setIsApiSettingsOpen] = useState(false);
  const [balance, setBalance] = useState<{ amount: number; currency: string } | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);

  const nodesRef = useRef(nodes);
  const connectionsRef = useRef(connections);
  const groupsRef = useRef(groups);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  const connectionStartRef = useRef(connectionStart);
  const rafRef = useRef<number | null>(null); 
  const replaceVideoInputRef = useRef<HTMLInputElement>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const replacementTargetRef = useRef<string | null>(null);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);
  
  const dragNodeRef = useRef<{ id: string, startX: number, startY: number, mouseStartX: number, mouseStartY: number, parentGroupId?: string | null, siblingNodeIds: string[], nodeWidth: number, nodeHeight: number, selectedNodeIds?: string[], selectedNodesStartPos?: Map<string, { x: number, y: number }> } | null>(null);
  const dragGroupRef = useRef<{ id: string, startX: number, startY: number, mouseStartX: number, mouseStartY: number, childNodes: {id: string, startX: number, startY: number}[] } | null>(null);
  const isMouseDownRef = useRef<boolean>(false);

  useEffect(() => { nodesRef.current = nodes; connectionsRef.current = connections; groupsRef.current = groups; historyRef.current = history; historyIndexRef.current = historyIndex; connectionStartRef.current = connectionStart; }, [nodes, connections, groups, history, historyIndex, connectionStart]);

  useEffect(() => {
      const loadData = async () => {
          try {
            const sAssets = await loadFromStorage<any[]>('assets'); if (sAssets) setAssetHistory(sAssets);
            const sWfs = await loadFromStorage<Workflow[]>('workflows'); if (sWfs) setWorkflows(sWfs);
            const sNodes = await loadFromStorage<AppNode[]>('nodes'); if (sNodes) setNodes(sNodes);
            const sConns = await loadFromStorage<Connection[]>('connections'); if (sConns) setConnections(sConns);
            const sGroups = await loadFromStorage<Group[]>('groups'); if (sGroups) setGroups(sGroups);
          } catch (e) { console.error(e); } finally { setIsLoaded(true); }
      };
      loadData();
  }, []);

  // 初始化历史记录：在数据加载完成后保存初始状态
  useEffect(() => {
      if (isLoaded && history.length === 0 && historyIndex === -1) {
          // 使用 ref 获取最新值，避免闭包问题
          const initialStep = { 
              nodes: JSON.parse(JSON.stringify(nodesRef.current || [])), 
              connections: JSON.parse(JSON.stringify(connectionsRef.current || [])), 
              groups: JSON.parse(JSON.stringify(groupsRef.current || [])) 
          };
          setHistory([initialStep]);
          setHistoryIndex(0);
      }
  }, [isLoaded, history.length, historyIndex]);

  useEffect(() => { if (!isLoaded) return; saveToStorage('assets', assetHistory); saveToStorage('workflows', workflows); saveToStorage('nodes', nodes); saveToStorage('connections', connections); saveToStorage('groups', groups); }, [assetHistory, workflows, nodes, connections, groups, isLoaded]);

  // 获取第一个节点的图像作为缩略图
  const getProjectThumbnail = useCallback(() => {
    const firstImageNode = nodes.find(n => n.data?.image);
    if (firstImageNode?.data?.image) {
      return firstImageNode.data.image;
    }
    const firstVideoNode = nodes.find(n => n.data?.videoUri);
    if (firstVideoNode?.data?.videoUri) {
      return firstVideoNode.data.videoUri;
    }
    return null;
  }, [nodes]);

  // 自动保存当前项目
  // Initialize AIService: Fetch models on mount
  useEffect(() => {
    refreshAiModels();
  }, []);

  const refreshAiModels = async () => {
    setLoadingAiModels(true);
    try {
      const newModels = await aiService.fetchModels();
      setAiModels(newModels);
    } catch (e) {
      console.error("Failed to auto-fetch models", e);
    } finally {
      setLoadingAiModels(false);
    }
  };

  // Get models from config.ts
  const getModelsFromConfig = (nodeType: NodeType): string[] => {
    const config = modelsConfig.models;
    
    if (nodeType === NodeType.IMAGE_GENERATOR || nodeType === NodeType.IMAGE_EDITOR) {
      // 返回图片模型列表（模型ID作为key）
      return Object.keys(config.image || {});
    } else if (nodeType === NodeType.VIDEO_GENERATOR || nodeType === NodeType.VIDEO_ANALYZER) {
      // 返回视频模型列表（模型ID作为key）
      return Object.keys(config.video || {});
    } else if (nodeType === NodeType.PROMPT_INPUT) {
      // 文本模型暂时从 AIService 获取，因为 config.ts 中没有文本模型配置
      return aiModels.text;
    }
    
    return [];
  };

  // Fetch balance
  const fetchBalance = async () => {
    setLoadingBalance(true);
    try {
      const balanceData = await aiService.fetchBalance();
      setBalance(balanceData);
    } catch (e) {
      console.error("Failed to fetch balance", e);
      setBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  };

  // Auto-fetch balance when API key is available
  useEffect(() => {
    if (aiConfig.apiKey && viewMode === 'projects') {
      fetchBalance();
    }
  }, [aiConfig.apiKey, viewMode]);

  useEffect(() => {
    if (!isLoaded || viewMode !== 'canvas') return;
    
    const autoSave = async () => {
      try {
        // 空画布不保存到项目
        if (nodes.length === 0) {
          // 如果当前项目是空的，从项目列表中删除
          if (currentProjectId) {
            setProjects(prev => {
              const updatedProjects = prev.filter(p => p.id !== currentProjectId);
              saveToStorage('projects', updatedProjects).catch(e => console.error('Failed to save projects:', e));
              return updatedProjects;
            });
            setCurrentProjectId(null);
          }
          return;
        }
        
        // 必须有 currentProjectId 才能保存，如果没有则说明是新画布，不自动创建项目
        // 只有在用户明确创建新项目或加载项目时才会设置 currentProjectId
        if (!currentProjectId) {
          // 不自动创建项目，等待用户明确操作
          return;
        }
        
        // 获取缩略图
        const thumbnail = getProjectThumbnail();
        
        // 获取项目标题（保持原有标题，如果不存在则使用第一个节点的标题）
        const existingProject = projects.find(p => p.id === currentProjectId);
        const projectTitle = existingProject?.title || (nodes.length > 0 && nodes[0].title ? nodes[0].title : 'Untitled');
        
        // 更新项目数据（只更新，不创建新项目）
        const projectData = {
          id: currentProjectId,
          title: projectTitle,
          description: existingProject?.description || '',
          thumbnail: thumbnail,
          nodes: JSON.parse(JSON.stringify(nodes)),
          connections: JSON.parse(JSON.stringify(connections)),
          groups: JSON.parse(JSON.stringify(groups)),
          updatedAt: new Date().toISOString()
        };

        // 更新项目列表（只更新现有项目）
        setProjects(prev => {
          const existingIndex = prev.findIndex(p => p.id === currentProjectId);
          let updatedProjects;
          if (existingIndex >= 0) {
            // 更新现有项目
            updatedProjects = [...prev];
            updatedProjects[existingIndex] = projectData;
          } else {
            // 如果项目不存在（不应该发生），创建新项目
            updatedProjects = [...prev, projectData];
          }
          
          // 保存到本地存储
          saveToStorage('projects', updatedProjects).catch(e => console.error('Failed to save projects:', e));
          
          return updatedProjects;
        });
      } catch (e) {
        console.error('Auto save failed:', e);
      }
    };

    // 延迟保存，避免频繁保存（只在有节点且有项目ID时保存）
    const timeoutId = (nodes.length > 0 && currentProjectId) ? setTimeout(autoSave, 2000) : null;
    
    // 定期自动保存（每30秒，只在有节点且有项目ID时保存）
    const intervalId = (nodes.length > 0 && currentProjectId) ? setInterval(autoSave, 30000) : null;

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [nodes, connections, groups, isLoaded, viewMode, currentProjectId, getProjectThumbnail, projects]);

  // 加载项目列表
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const savedProjects = await loadFromStorage<any[]>('projects');
        if (savedProjects) {
          // 过滤掉空项目（没有节点的项目）
          const validProjects = savedProjects.filter(p => p.nodes && p.nodes.length > 0);
          setProjects(validProjects);
          // 如果有空项目被过滤掉，更新存储
          if (validProjects.length !== savedProjects.length) {
            await saveToStorage('projects', validProjects);
          }
        }
      } catch (e) {
        console.error('Failed to load projects:', e);
      }
    };
    loadProjects();
  }, []);

  const getApproxNodeHeight = (node: AppNode) => {
      if (node.height) return node.height;
      const width = node.width || 420;
      if (['PROMPT_INPUT', 'VIDEO_ANALYZER', 'IMAGE_EDITOR'].includes(node.type)) return 360;
      if (node.type === NodeType.AUDIO_GENERATOR) return 200;
      const [w, h] = (node.data.aspectRatio || '16:9').split(':').map(Number);
      const extra = (node.type === NodeType.VIDEO_GENERATOR && node.data.generationMode === 'CUT') ? 36 : 0;
      return ((width * h / w) + extra);
  };
  
  const getNodeBounds = (node: AppNode) => {
      const h = node.height || getApproxNodeHeight(node);
      const w = node.width || 420;
      return { x: node.x, y: node.y, width: w, height: h, r: node.x + w, b: node.y + h };
  };

  const getNodeNameCN = (t: string) => {
      switch(t) {
          case NodeType.PROMPT_INPUT: return '创意描述';
          case NodeType.IMAGE_GENERATOR: return '文字生图';
          case NodeType.VIDEO_GENERATOR: return '文生视频';
          case NodeType.AUDIO_GENERATOR: return '灵感音乐';
          case NodeType.VIDEO_ANALYZER: return '视频分析';
          case NodeType.IMAGE_EDITOR: return '图像编辑';
          default: return t;
      }
  };
  const getNodeIcon = (t: string) => {
      switch(t) {
          case NodeType.PROMPT_INPUT: return Type;
          case NodeType.IMAGE_GENERATOR: return ImageIcon;
          case NodeType.VIDEO_GENERATOR: return Film;
          case NodeType.AUDIO_GENERATOR: return Mic2;
          case NodeType.VIDEO_ANALYZER: return ScanFace;
          case NodeType.IMAGE_EDITOR: return Brush;
          default: return Plus;
      }
  };

  const handleFitView = useCallback(() => {
      if (nodes.length === 0) { setPan({ x: 0, y: 0 }); setScale(1); return; }
      const padding = 100;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodes.forEach(n => {
          const b = getNodeBounds(n);
          if (b.x < minX) minX = b.x; if (b.y < minY) minY = b.y; if (b.r > maxX) maxX = b.r; if (b.b > maxY) maxY = b.b;
      });
      const contentW = maxX - minX, contentH = maxY - minY;
      const scaleX = (window.innerWidth - padding * 2) / contentW, scaleY = (window.innerHeight - padding * 2) / contentH;
      let newScale = Math.min(scaleX, scaleY, 1); newScale = Math.max(0.2, newScale);
      const centerX = minX + contentW / 2, centerY = minY + contentH / 2;
      setPan({ x: (window.innerWidth / 2) - (centerX * newScale), y: (window.innerHeight / 2) - (centerY * newScale) });
      setScale(newScale);
  }, [nodes]);

  const saveHistory = useCallback(() => {
      try {
          // 使用 ref 获取最新值（因为可能在异步操作中调用）
          const currentNodes = nodesRef.current || [];
          const currentConnections = connectionsRef.current || [];
          const currentGroups = groupsRef.current || [];
          
          const currentStep = { 
              nodes: JSON.parse(JSON.stringify(currentNodes)), 
              connections: JSON.parse(JSON.stringify(currentConnections)), 
              groups: JSON.parse(JSON.stringify(currentGroups)) 
          };
          
          // 使用函数式更新确保使用最新值
          setHistory(prevHistory => {
              setHistoryIndex(prevIdx => {
                  // 如果历史记录为空，先初始化
                  if (prevHistory.length === 0 || prevIdx === -1) {
                      return 0;
                  }
                  
                  // 截取到当前索引，然后添加新状态（这样重做历史会被清除）
                  const newHistory = prevHistory.slice(0, prevIdx + 1);
                  newHistory.push(currentStep);
                  if (newHistory.length > 50) newHistory.shift();
                  
                  return newHistory.length - 1;
              });
              
              // 如果历史记录为空，返回新数组
              if (prevHistory.length === 0) {
                  return [currentStep];
              }
              
              // 使用 ref 获取最新的 historyIndex
              const currentIdx = historyIndexRef.current;
              if (currentIdx === -1) {
                  return [currentStep];
              }
              
              // 否则返回更新后的历史记录
              const newHistory = prevHistory.slice(0, currentIdx + 1);
              newHistory.push(currentStep);
              if (newHistory.length > 50) newHistory.shift();
              return newHistory;
          });
      } catch (e) {
          console.error('Save history error:', e);
      }
  }, []);

  const undo = useCallback(() => {
      const currentIdx = historyIndex;
      const currentHistory = history;
      
      if (currentHistory.length === 0) {
          return;
      }
      
      if (currentIdx > 0) {
          const prev = currentHistory[currentIdx - 1];
          setNodes([...prev.nodes || []]);
          setConnections([...prev.connections || []]);
          setGroups([...prev.groups || []]);
          setHistoryIndex(currentIdx - 1);
      } else if (currentIdx === 0) {
          // 如果已经在第一个历史记录，恢复到初始状态
          const initial = currentHistory[0];
          setNodes([...initial.nodes || []]);
          setConnections([...initial.connections || []]);
          setGroups([...initial.groups || []]);
          setHistoryIndex(0);
      }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
      const currentIdx = historyIndex;
      const currentHistory = history;
      
      if (currentIdx < currentHistory.length - 1) {
          const next = currentHistory[currentIdx + 1];
          setNodes([...next.nodes || []]);
          setConnections([...next.connections || []]);
          setGroups([...next.groups || []]);
          setHistoryIndex(currentIdx + 1);
      }
  }, [history, historyIndex]);

  const deleteNodes = useCallback((ids: string[]) => { 
      if (ids.length === 0) return;
      
      // 在删除之前保存当前状态到历史记录（使用当前 state 值）
      const currentStep = { 
          nodes: JSON.parse(JSON.stringify(nodes)), 
          connections: JSON.parse(JSON.stringify(connections)), 
          groups: JSON.parse(JSON.stringify(groups)) 
      };
      
      // 更新历史记录
      if (history.length === 0 || historyIndex === -1) {
          setHistory([currentStep]);
          setHistoryIndex(0);
      } else {
          const newHistory = history.slice(0, historyIndex + 1);
          newHistory.push(currentStep);
          if (newHistory.length > 50) newHistory.shift();
          setHistory(newHistory);
          setHistoryIndex(newHistory.length - 1);
      }
      
      // 然后执行删除操作
      setNodes(p => p.filter(n => !ids.includes(n.id)).map(n => ({...n, inputs: n.inputs.filter(i => !ids.includes(i))}))); 
      setConnections(p => p.filter(c => !ids.includes(c.from) && !ids.includes(c.to))); 
      setSelectedNodeIds([]);
  }, [nodes, connections, groups, history, historyIndex]);

  const clearCanvas = useCallback(() => {
      if (nodes.length === 0 && connections.length === 0 && groups.length === 0) return;
      saveHistory();
      setNodes([]);
      setConnections([]);
      setGroups([]);
      setSelectedNodeIds([]);
      // 清空画布时，清除当前项目ID，空画布不保存到项目
      setCurrentProjectId(null);
      setShowClearCanvasConfirm(false);
  }, [nodes, connections, groups, saveHistory]);

  const addNode = useCallback((type: NodeType, x?: number, y?: number, initialData?: any) => {
      if (type === NodeType.IMAGE_EDITOR) { setIsSketchEditorOpen(true); return; }
      try { saveHistory(); } catch (e) { }
      const defaults: any = { model: type === NodeType.VIDEO_GENERATOR ? 'veo-3.1-fast-generate-preview' : type === NodeType.VIDEO_ANALYZER ? 'gemini-3-pro-preview' : type === NodeType.AUDIO_GENERATOR ? 'gemini-2.5-flash-preview-tts' : type.includes('IMAGE') ? 'gemini-2.5-flash-image' : 'gemini-3-pro-preview', generationMode: type === NodeType.VIDEO_GENERATOR ? 'DEFAULT' : undefined, ...initialData };
      const safeX = x !== undefined ? x : (-pan.x + window.innerWidth/2)/scale - 210, safeY = y !== undefined ? y : (-pan.y + window.innerHeight/2)/scale - 180;
      const newNode: AppNode = { id: `n-${Date.now()}-${Math.floor(Math.random()*1000)}`, type, x: isNaN(safeX) ? 100 : safeX, y: isNaN(safeY) ? 100 : safeY, width: 320, title: getNodeNameCN(type), status: NodeStatus.IDLE, data: defaults, inputs: [] };
      setNodes(prev => [...prev, newNode]); 
  }, [pan, scale, saveHistory]);

  const handleAssetGenerated = useCallback((type: 'image' | 'video' | 'audio', src: string, title: string) => {
      setAssetHistory(h => { if (h.find(a => a.src === src)) return h; return [{ id: `a-${Date.now()}`, type, src, title, timestamp: Date.now() }, ...h]; });
  }, []);
  
  const handleSketchResult = (type: 'image' | 'video', result: string, prompt: string) => {
      const centerX = (-pan.x + window.innerWidth/2)/scale - 210, centerY = (-pan.y + window.innerHeight/2)/scale - 180;
      if (type === 'image') addNode(NodeType.IMAGE_GENERATOR, centerX, centerY, { image: result, prompt, status: NodeStatus.SUCCESS });
      else addNode(NodeType.VIDEO_GENERATOR, centerX, centerY, { videoUri: result, prompt, status: NodeStatus.SUCCESS });
      handleAssetGenerated(type, result, prompt || 'Sketch Output');
  };

  const handleMultiFrameGenerate = async (frames: SmartSequenceItem[]): Promise<string> => {
      const complexPrompt = compileMultiFramePrompt(frames);
      try {
          const res = await generateVideo(complexPrompt, 'veo-3.1-generate-preview', { aspectRatio: '16:9', count: 1 }, frames[0].src, null, frames.length > 1 ? frames.map(f => f.src) : undefined);
          handleAssetGenerated(res.isFallbackImage ? 'image' : 'video', res.uri, 'Smart Sequence');
          return res.uri;
      } catch (e: any) { throw new Error(e.message || "Failed"); }
  };

  const handleNodeUpdate = useCallback((id: string, data: any, size?: any, title?: string) => {
      setNodes(prev => prev.map(n => {
          if (n.id === id) {
              const updated = { ...n, data: { ...n.data, ...data }, title: title || n.title };
              if (size) { if (size.width) updated.width = size.width; if (size.height) updated.height = size.height; }
              if (data.image) handleAssetGenerated('image', data.image, updated.title);
              if (data.videoUri) handleAssetGenerated('video', data.videoUri, updated.title);
              if (data.audioUri) handleAssetGenerated('audio', data.audioUri, updated.title);
              return updated;
          }
          return n;
      }));
  }, [handleAssetGenerated]);

  // 计算节点的输入资产
  const getInputAssets = useCallback((node: AppNode): Array<{ id: string, type: 'image' | 'video', src: string }> => {
      const inputNodes = node.inputs.map(inputId => nodes.find(n => n.id === inputId)).filter(Boolean) as AppNode[];
      const assets: Array<{ id: string, type: 'image' | 'video', src: string }> = [];
      
      inputNodes.forEach(inputNode => {
          if (inputNode.data.image) {
              assets.push({ id: inputNode.id, type: 'image', src: inputNode.data.image });
          } else if (inputNode.data.videoUri) {
              assets.push({ id: inputNode.id, type: 'video', src: inputNode.data.videoUri });
          }
      });
      
      // 按照 sortedInputIds 排序（如果存在）
      if (node.data.sortedInputIds && node.data.sortedInputIds.length > 0) {
          const sorted = [...assets].sort((a, b) => {
              const aIndex = node.data.sortedInputIds!.indexOf(a.id);
              const bIndex = node.data.sortedInputIds!.indexOf(b.id);
              if (aIndex === -1) return 1;
              if (bIndex === -1) return -1;
              return aIndex - bIndex;
          });
          return sorted;
      }
      
      return assets;
  }, [nodes]);

  // 处理输入重新排序
  const handleInputReorder = useCallback((nodeId: string, newOrder: string[]) => {
      setNodes(prev => prev.map(n => 
          n.id === nodeId ? { ...n, data: { ...n.data, sortedInputIds: newOrder } } : n
      ));
  }, []);

  const handleNodeAction = useCallback(async (id: string, promptOverride?: string) => {
      const node = nodesRef.current.find(n => n.id === id); if (!node) return;
      handleNodeUpdate(id, { error: undefined });
      setNodes(p => p.map(n => n.id === id ? { ...n, status: NodeStatus.WORKING } : n));
      try {
          // 获取连接的输入节点
          const inputs = node.inputs.map(i => nodesRef.current.find(n => n.id === i)).filter(Boolean) as AppNode[];
          
          // 收集上游文本（prompt 或 analysis）
          const upstreamTexts = inputs.map(n => {
              if (n.type === NodeType.PROMPT_INPUT) return n.data.prompt;
              if (n.type === NodeType.VIDEO_ANALYZER) return n.data.analysis;
              return null;
          }).filter(t => t && t.trim().length > 0) as string[];
          
          let prompt = promptOverride || node.data.prompt || '';
          if (upstreamTexts.length > 0) {
              prompt = prompt ? `${upstreamTexts.join('\n')}\n${prompt}` : upstreamTexts.join('\n');
          }

          if (node.type === NodeType.IMAGE_GENERATOR) {
              // 从输入节点获取图片（按照排序顺序）
              const inputImages: string[] = [];
              const sortedInputIds = node.data.sortedInputIds || node.inputs;
              sortedInputIds.forEach(inputId => {
                  const inputNode = inputs.find(n => n.id === inputId);
                  if (inputNode?.data.image) {
                      inputImages.push(inputNode.data.image);
                  }
              });
              
              // 解析 prompt 中的 @Image 引用
              const atImageRegex = /@Image (\d+)/g;
              const atMatches = [...prompt.matchAll(atImageRegex)];
              const inputAssets = getInputAssets(node);
              atMatches.forEach(match => {
                  const imageIndex = parseInt(match[1]) - 1; // @Image 1 对应索引 0
                  if (imageIndex >= 0 && imageIndex < inputAssets.length && inputAssets[imageIndex].type === 'image') {
                      // 如果图片不在 inputImages 中，则添加
                      if (!inputImages.includes(inputAssets[imageIndex].src)) {
                          inputImages.push(inputAssets[imageIndex].src);
                      }
                  }
              });
              
              const res = await generateImageFromText(prompt, node.data.model!, inputImages, { aspectRatio: node.data.aspectRatio, resolution: node.data.resolution, count: node.data.imageCount });
              handleNodeUpdate(id, { image: res[0], images: res });
          } else if (node.type === NodeType.VIDEO_GENERATOR) {
              // 解析 prompt 中的 @Image 引用，用于视频生成
              const inputAssets = getInputAssets(node);
              const atImageRegex = /@Image (\d+)/g;
              const atMatches = [...prompt.matchAll(atImageRegex)];
              const referencedImages: string[] = [];
              atMatches.forEach(match => {
                  const imageIndex = parseInt(match[1]) - 1;
                  if (imageIndex >= 0 && imageIndex < inputAssets.length && inputAssets[imageIndex].type === 'image') {
                      if (!referencedImages.includes(inputAssets[imageIndex].src)) {
                          referencedImages.push(inputAssets[imageIndex].src);
                      }
                  }
              });
              
              const strategy = await getGenerationStrategy(node, inputs, prompt);
              // 将 @ 引用的图片添加到 referenceImages
              const allReferenceImages = referencedImages.length > 0 
                  ? [...(strategy.referenceImages || []), ...referencedImages]
                  : strategy.referenceImages;
              const res = await generateVideo(strategy.finalPrompt, node.data.model!, { aspectRatio: node.data.aspectRatio, count: node.data.videoCount, generationMode: strategy.generationMode, resolution: node.data.resolution }, strategy.inputImageForGeneration, strategy.videoInput, allReferenceImages, strategy.lastFrameForGeneration);
              handleNodeUpdate(id, res.isFallbackImage ? { image: res.uri, error: "Preview generated." } : { videoUri: res.uri, videoMetadata: res.videoMetadata, videoUris: res.uris });
          } else if (node.type === NodeType.AUDIO_GENERATOR) {
              const audioUri = await generateAudio(prompt);
              handleNodeUpdate(id, { audioUri });
          } else if (node.type === NodeType.VIDEO_ANALYZER) {
             // 优先使用节点自己的视频，否则从输入节点获取
             const vid = node.data.videoUri || inputs.find(n => n?.data.videoUri)?.data.videoUri;
             if (!vid) throw new Error("No video");
             const txt = await analyzeVideo(vid, prompt, node.data.model!);
             handleNodeUpdate(id, { analysis: txt });
          }
          setNodes(p => p.map(n => n.id === id ? { ...n, status: NodeStatus.SUCCESS } : n));
      } catch (e: any) { handleNodeUpdate(id, { error: e.message, status: NodeStatus.ERROR }); }
  }, [handleNodeUpdate]);

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
      const { clientX, clientY } = e; if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null; setMousePos({ x: clientX, y: clientY });
          
          // 如果框选框存在但鼠标按钮没有按下，清除框选框
          if (selectionRect && !isMouseDownRef.current) {
              setSelectionRect(null);
              setIsMouseDown(false);
              return;
          }
          
          if (connectionStartRef.current) {
              // 检查鼠标是否悬停在端口上
              const elements = document.elementsFromPoint(clientX, clientY);
              const portElement = elements.find(el => {
                  const portId = el.getAttribute('data-port-id');
                  return portId && portId !== connectionStartRef.current?.id;
              });
              
              if (portElement) {
                  const portId = portElement.getAttribute('data-port-id');
                  const portType = portElement.getAttribute('data-port-type') as 'input' | 'output' | null;
                  if (portId && portType) {
                      setHoveredPort({ id: portId, type: portType });
                      // 如果悬停在端口上，计算端口中心位置
                      const targetNode = nodesRef.current.find(n => n.id === portId);
                      if (targetNode) {
                          // 获取节点的实际DOM高度（更准确）
                          const targetNodeElement = document.querySelector(`[data-node-id="${portId}"]`) as HTMLElement;
                          const targetHeight = targetNodeElement ? targetNodeElement.offsetHeight : (targetNode.height || getApproxNodeHeight(targetNode));
                          const targetWidth = targetNode.width || 320;
                          // 计算端口中心位置：
                          // 端口使用 -left-3 和 -right-3，按钮大小 w-4 h-4 (16px)
                          // -left-3 = 按钮左边缘在节点左边缘左侧12px，按钮中心在 node.x - 12 + 8 = node.x - 4
                          // -right-3 = 按钮右边缘在节点右边缘右侧12px，按钮中心在 node.x + width + 12 - 8 = node.x + width + 4
                          const portX = portType === 'output' 
                              ? targetNode.x + targetWidth + 4  // output端口中心：节点右边缘 + 12px(offset) - 8px(按钮中心) = +4px
                              : targetNode.x - 4;  // input端口中心：节点左边缘 - 12px(offset) + 8px(按钮中心) = -4px
                          const portY = targetNode.y + targetHeight / 2;  // 节点垂直中心（使用实际DOM高度）
                          setConnectionEnd({ x: portX, y: portY });
                      } else {
                          // 如果找不到节点，使用鼠标位置
                          const endX = (clientX - pan.x) / scale;
                          const endY = (clientY - pan.y) / scale;
                          setConnectionEnd({ x: endX, y: endY });
                      }
                  } else {
                      setHoveredPort(null);
                      // 计算连接线终点位置（考虑缩放和平移）
                      const endX = (clientX - pan.x) / scale;
                      const endY = (clientY - pan.y) / scale;
                      setConnectionEnd({ x: endX, y: endY });
                  }
              } else {
                  setHoveredPort(null);
                  // 计算连接线终点位置（考虑缩放和平移）
                  const endX = (clientX - pan.x) / scale;
                  const endY = (clientY - pan.y) / scale;
                  setConnectionEnd({ x: endX, y: endY });
              }
              return;
          }
          // 更新框选框位置
          if (selectionRect) { 
              setSelectionRect((p:any) => p ? ({ ...p, currentX: clientX, currentY: clientY }) : null); 
              return; 
          }
          if (dragGroupRef.current) {
              const { id, startX, startY, mouseStartX, mouseStartY, childNodes } = dragGroupRef.current;
              const dx = (clientX - mouseStartX) / scale, dy = (clientY - mouseStartY) / scale;
              setGroups(prev => prev.map(g => g.id === id ? { ...g, x: startX + dx, y: startY + dy } : g));
              setNodes(prev => prev.map(n => { const c = childNodes.find(x => x.id === n.id); return c ? { ...n, x: c.startX + dx, y: c.startY + dy } : n; })); 
              return;
          }
          if (isDraggingCanvas) { const dx = clientX - lastMousePos.x, dy = clientY - lastMousePos.y; setPan(p => ({ x: p.x + dx, y: p.y + dy })); setLastMousePos({ x: clientX, y: clientY }); }
          if (draggingNodeId && dragNodeRef.current) {
             const { id, startX, startY, mouseStartX, mouseStartY, selectedNodeIds: dragSelectedIds, selectedNodesStartPos } = dragNodeRef.current;
             let dx = (clientX - mouseStartX) / scale, dy = (clientY - mouseStartY) / scale;
             
             // 如果有多选节点，同时拖动所有选中的节点
             if (dragSelectedIds && dragSelectedIds.length > 1 && selectedNodesStartPos) {
                 // 使用存储的初始位置更新所有选中节点
                 setNodes(prev => prev.map(n => {
                     if (dragSelectedIds.includes(n.id)) {
                         const nodeStartPos = selectedNodesStartPos.get(n.id);
                         if (nodeStartPos) {
                             return { ...n, x: nodeStartPos.x + dx, y: nodeStartPos.y + dy };
                         }
                     }
                     return n;
                 }));
             } else {
                 // 单个节点拖动
                 setNodes(prev => {
                   const node = prev.find(n => n.id === id);
                   if (!node) return prev;
                   return prev.map(n => n.id === id ? { ...n, x: startX + dx, y: startY + dy } : n);
                 });
             }
          }
      });
  }, [selectionRect, isDraggingCanvas, draggingNodeId, scale, lastMousePos, pan]);

  const handleGlobalMouseUp = useCallback((e: MouseEvent) => {
      isMouseDownRef.current = false;
      setIsMouseDown(false);
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (connectionStartRef.current) {
          // 检查是否在另一个端口上释放
          const elements = document.elementsFromPoint(e.clientX, e.clientY);
          
          // 查找所有可能的端口元素（包括父元素）
          let portElement: Element | null = null;
          for (const el of elements) {
              const portId = el.getAttribute('data-port-id');
              if (portId && portId !== connectionStartRef.current.id) {
                  portElement = el;
                  break;
              }
              // 也检查父元素
              let parent = el.parentElement;
              while (parent && parent !== document.body) {
                  const parentPortId = parent.getAttribute('data-port-id');
                  if (parentPortId && parentPortId !== connectionStartRef.current.id) {
                      portElement = parent;
                      break;
                  }
                  parent = parent.parentElement;
              }
              if (portElement) break;
          }
          
          if (portElement) {
              const targetId = portElement.getAttribute('data-port-id');
              const targetType = portElement.getAttribute('data-port-type') as 'input' | 'output';
              
              if (targetId && targetType && targetId !== connectionStartRef.current.id && targetType !== connectionStartRef.current.type) {
                  // 确定连接方向：output -> input
                  const fromId = connectionStartRef.current.type === 'output' ? connectionStartRef.current.id : targetId;
                  const toId = connectionStartRef.current.type === 'output' ? targetId : connectionStartRef.current.id;
                  
                  // 检查是否已存在连接
                  if (!connectionsRef.current.find(c => c.from === fromId && c.to === toId)) {
                      saveHistory();
                      setConnections(p => [...p, { from: fromId, to: toId }]);
                      setNodes(p => {
                          const updated = p.map(x => {
                              if (x.id === toId) {
                                  // 确保输入ID不重复
                                  const newInputs = x.inputs.includes(fromId) ? x.inputs : [...x.inputs, fromId];
                                  return { ...x, inputs: newInputs };
                              }
                              return x;
                          });
                          return updated;
                      });
                  }
                  setConnectionStart(null);
                  setConnectionEnd(null);
                  setHoveredPort(null);
              } else {
                  setConnectionStart(null);
                  setConnectionEnd(null);
                  setHoveredPort(null);
              }
          } else {
              // 如果没有连接到端口，且是从输出端口开始的，显示创建节点菜单
              if (connectionStartRef.current && connectionStartRef.current.type === 'output') {
                  const endX = (e.clientX - pan.x) / scale;
                  const endY = (e.clientY - pan.y) / scale;
                  setConnectionMenu({ x: e.clientX, y: e.clientY, fromId: connectionStartRef.current.id });
                  setConnectionEnd({ x: endX, y: endY });
                  // 保持连接线显示，不清理 connectionStart
              } else {
                  setConnectionStart(null);
                  setConnectionEnd(null);
                  setHoveredPort(null);
              }
          }
      }
      // 处理框选逻辑
      if (selectionRect) {
          const rectStartX = Math.min(selectionRect.startX, selectionRect.currentX);
          const rectStartY = Math.min(selectionRect.startY, selectionRect.currentY);
          const rectEndX = Math.max(selectionRect.startX, selectionRect.currentX);
          const rectEndY = Math.max(selectionRect.startY, selectionRect.currentY);
          const rectWidth = Math.abs(selectionRect.currentX - selectionRect.startX);
          const rectHeight = Math.abs(selectionRect.currentY - selectionRect.startY);
          
          if (rectWidth > 10 && rectHeight > 10) {
              // 将屏幕坐标转换为画布坐标
              const canvasRectStartX = (rectStartX - pan.x) / scale;
              const canvasRectStartY = (rectStartY - pan.y) / scale;
              const canvasRectEndX = (rectEndX - pan.x) / scale;
              const canvasRectEndY = (rectEndY - pan.y) / scale;
              
              // 检查哪些节点在框选区域内（更准确的判断：节点与框选区域有交集）
              const enclosed = nodesRef.current.filter(n => {
                  const b = getNodeBounds(n);
                  // 检查节点边界框是否与框选区域有交集
                  // 节点在框选区域内：节点的任何部分在框选区域内
                  const nodeLeft = b.x;
                  const nodeRight = b.r;
                  const nodeTop = b.y;
                  const nodeBottom = b.b;
                  
                  // 检查是否有交集
                  const hasOverlap = !(nodeRight < canvasRectStartX || 
                                       nodeLeft > canvasRectEndX || 
                                       nodeBottom < canvasRectStartY || 
                                       nodeTop > canvasRectEndY);
                  
                  return hasOverlap;
              });
              
              if (enclosed.length > 0) {
                  // 批量选择框选中的节点
                  // 如果按住 Shift 键，添加到已有选择；否则替换选择
                  const newSelectedIds = enclosed.map(n => n.id);
                  if (e.shiftKey) {
                      // Shift + 框选：添加到已有选择（去重）
                      setSelectedNodeIds(prev => {
                          const combined = [...prev, ...newSelectedIds];
                          return [...new Set(combined)]; // 去重
                      });
                  } else {
                      // 普通框选：替换选择
                      setSelectedNodeIds(newSelectedIds);
                  }
              } else if (!e.shiftKey) {
                  // 如果框选区域没有选中任何节点，且没有按住 Shift，清除选择
                  setSelectedNodeIds([]);
              }
          } else {
              // 框选区域太小，如果没有按住 Shift，清除选择
              if (!e.shiftKey) {
                  setSelectedNodeIds([]);
              }
          }
          // 强制清除框选框
          setSelectionRect(null);
          setIsMouseDown(false);
          isMouseDownRef.current = false;
      }
      if (draggingNodeId || dragGroupRef.current) saveHistory();
      setIsDraggingCanvas(false); 
      setDraggingNodeId(null); 
      setDraggingGroup(null); 
      // 强制清除框选框和鼠标状态
      setSelectionRect(null);
      setIsMouseDown(false);
      isMouseDownRef.current = false;
      dragNodeRef.current = null; 
      dragGroupRef.current = null;
  }, [connectionStart, selectionRect, pan, scale, saveHistory, draggingNodeId]);

  useEffect(() => { 
      const handleGlobalMouseDown = (e: MouseEvent) => {
          isMouseDownRef.current = true;
          setIsMouseDown(true);
      };
      
      window.addEventListener('mousedown', handleGlobalMouseDown);
      window.addEventListener('mousemove', handleGlobalMouseMove); 
      window.addEventListener('mouseup', handleGlobalMouseUp); 
      return () => { 
          window.removeEventListener('mousedown', handleGlobalMouseDown);
          window.removeEventListener('mousemove', handleGlobalMouseMove); 
          window.removeEventListener('mouseup', handleGlobalMouseUp); 
      }; 
  }, [handleGlobalMouseMove, handleGlobalMouseUp]);

  // 初始化鼠标状态
  useEffect(() => {
      isMouseDownRef.current = false;
      setIsMouseDown(false);
      setSelectionRect(null);
  }, []);
  
  // 确保框选框在鼠标未按下时被清除
  useEffect(() => {
      if (selectionRect && !isMouseDown && !isMouseDownRef.current) {
          setSelectionRect(null);
      }
  }, [selectionRect, isMouseDown]);

  // 处理键盘事件（删除、撤销、重做）
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          // 如果在首页，按任意键进入项目管理
          if (viewMode === 'home') {
              const target = e.target as HTMLElement;
              const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
              if (!isInputFocused) {
                  setViewMode('projects');
                  return;
              }
          }
          
          const target = e.target as HTMLElement;
          const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
          const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
          const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

          // ESC 键关闭连接菜单、右键菜单和清除框选框
          if (e.key === 'Escape') {
              if (connectionMenu) {
                  setConnectionMenu(null);
                  setConnectionStart(null);
                  setConnectionEnd(null);
              }
              if (contextMenu) {
                  setContextMenu(null);
                  setContextMenuTarget(null);
              }
              // 清除框选框
              if (selectionRect) {
                  setSelectionRect(null);
                  setIsMouseDown(false);
              }
              return;
          }

          // 处理撤销 Cmd/Ctrl+Z
          if (cmdOrCtrl && e.key === 'z' && !e.shiftKey) {
              // 如果在输入框中，不阻止默认行为（让输入框自己处理撤销）
              if (isInputFocused) {
                  return;
              }
              e.preventDefault();
              undo();
              return;
          }

          // 处理重做 Cmd/Ctrl+Shift+Z 或 Cmd/Ctrl+Y
          if (cmdOrCtrl && ((e.shiftKey && e.key === 'Z') || e.key === 'y')) {
              // 如果在输入框中，不阻止默认行为
              if (isInputFocused) {
                  return;
              }
              e.preventDefault();
              redo();
              return;
          }

          // 处理复制 Cmd/Ctrl+C
          if (cmdOrCtrl && e.key === 'c' && !isInputFocused && selectedNodeIds.length > 0) {
              e.preventDefault();
              const selectedNode = nodes.find(n => n.id === selectedNodeIds[0]);
              if (selectedNode) {
                  setClipboard(JSON.parse(JSON.stringify(selectedNode)));
              }
              return;
          }

          // 处理粘贴 Cmd/Ctrl+V
          if (cmdOrCtrl && e.key === 'v' && !isInputFocused && clipboard) {
              e.preventDefault();
              const x = (-pan.x + window.innerWidth/2)/scale - 210;
              const y = (-pan.y + window.innerHeight/2)/scale - 150;
              const newNode = {
                  ...clipboard,
                  id: `n-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                  x: x,
                  y: y,
                  inputs: []
              };
              saveHistory();
              setNodes(prev => [...prev, newNode]);
              return;
          }

          // 处理 Backspace 或 Delete 键删除节点
          if ((e.key === 'Backspace' || e.key === 'Delete') && !isInputFocused && selectedNodeIds.length > 0) {
              e.preventDefault();
              deleteNodes(selectedNodeIds);
          }
      };

      const handleClickOutside = (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          
          // 关闭连接菜单
          if (connectionMenu) {
              if (!target.closest('[data-connection-menu]')) {
                  setConnectionMenu(null);
                  setConnectionStart(null);
                  setConnectionEnd(null);
              }
          }
          
          // 关闭右键菜单
          if (contextMenu) {
              if (!target.closest('[data-context-menu]')) {
                  setContextMenu(null);
                  setContextMenuTarget(null);
              }
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('mousedown', handleClickOutside);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('mousedown', handleClickOutside);
      };
  }, [viewMode, selectedNodeIds, deleteNodes, undo, redo, connectionMenu, contextMenu, clipboard, pan, scale, saveHistory, nodes]);

  const saveCurrentAsWorkflow = () => {};
  const loadWorkflow = () => {};
  const deleteWorkflow = () => {};
  const renameWorkflow = () => {};

  // 保存项目名称
  const saveProjectName = useCallback(async (projectId: string, newName: string) => {
    if (newName.trim()) {
      const updatedProjects = projects.map(p => 
        p.id === projectId 
          ? { ...p, title: newName.trim() }
          : p
      );
      setProjects(updatedProjects);
      await saveToStorage('projects', updatedProjects);
    }
    setEditingProjectId(null);
    setEditingProjectName('');
  }, [projects]);

  // 点击空白处保存项目名称
  useEffect(() => {
    if (!editingProjectId) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 检查是否点击在项目名称输入框内
      const isInInput = target.tagName === 'INPUT' && target.getAttribute('type') === 'text' && target.closest('.project-title-area');
      // 检查是否点击在项目卡片内（但不包括输入框）
      const projectCard = target.closest(`[data-project-id="${editingProjectId}"]`);
      const isInProjectCard = projectCard && !isInInput;
      
      // 如果点击不在输入框内，也不在项目卡片内，保存并退出编辑
      if (!isInInput && !isInProjectCard) {
        saveProjectName(editingProjectId, editingProjectName);
      }
    };

    // 使用 setTimeout 确保在双击事件之后执行
    const timeoutId = setTimeout(() => {
      window.addEventListener('mousedown', handleClickOutside, true);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [editingProjectId, editingProjectName, saveProjectName]);

  // 项目管理界面
  const renderProjectManagement = () => {
    const filteredProjects = projects.filter(p => 
      p.title?.toLowerCase().includes(projectSearchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(projectSearchQuery.toLowerCase())
    );

    return (
      <div className="w-full h-full flex flex-col bg-[#0a0a0c]">
        {/* 顶部导航栏 */}
        <div className="w-full px-8 py-6 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl z-40">
          <div className="flex items-center justify-between mb-4">
            {/* 标题 */}
            <div className="flex items-center">
              <h1 className="text-lg font-semibold text-white">我的画布</h1>
            </div>

            {/* 右侧操作 */}
            <div className="flex items-center gap-3">
              {/* API连接设置按钮 */}
              <button
                onClick={() => setIsApiSettingsOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all"
              >
                <Unplug size={14} />
                <span>连接设置</span>
              </button>
              
              {/* 余额显示按钮 */}
              <button
                onClick={fetchBalance}
                disabled={loadingBalance}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingBalance ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>加载中...</span>
                  </>
                ) : balance ? (
                  <>
                    <span className={`font-semibold ${balance.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {balance.currency === 'USD' ? `$${balance.amount.toFixed(2)}` : 
                       balance.currency === 'pts' ? `${balance.amount.toLocaleString()} pts` :
                       `${balance.amount.toLocaleString()} ${balance.currency}`}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-400">未连接</span>
                  </>
                )}
              </button>
              
              <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all">
                <ArrowUpDown size={14} />
                <span>更新时间</span>
              </button>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Q 搜索"
                  value={projectSearchQuery}
                  onChange={(e) => setProjectSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-white/50 w-48"
                />
              </div>
              <button
                onClick={() => {
                  // 新建项目：创建新项目ID并切换到画布
                  const newProjectId = `project-${Date.now()}`;
                  setCurrentProjectId(newProjectId);
                  setViewMode('canvas');
                  setNodes([]);
                  setConnections([]);
                  setGroups([]);
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-white/20 hover:bg-white/30 border border-white/50 rounded-lg transition-all"
              >
                <Plus size={16} />
                <span>新建项目</span>
              </button>
            </div>
          </div>
        </div>

        {/* 项目网格 */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="grid grid-cols-4 gap-6 max-w-[1600px] mx-auto">
            {/* 新建项目卡片 */}
            <button
              onClick={() => {
                // 新建项目：创建新项目ID并切换到画布
                const newProjectId = `project-${Date.now()}`;
                setCurrentProjectId(newProjectId);
                setNodes([]);
                setConnections([]);
                setGroups([]);
                setViewMode('canvas');
              }}
              className="aspect-[4/3] rounded-2xl border-2 border-dashed border-white/10 hover:border-white/50 bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center gap-3 transition-all group"
            >
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <Plus size={24} className="text-white/80" />
              </div>
              <span className="text-sm font-medium text-slate-400 group-hover:text-white transition-colors">新建项目</span>
            </button>

            {/* 项目卡片 */}
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="aspect-[4/3] rounded-2xl border border-white/10 hover:border-white/50 bg-[#1c1c1e] hover:bg-[#2c2c2e] overflow-hidden cursor-pointer transition-all group relative"
              >
                {/* 删除图标 - 右上角 */}
                {deletingProjectId !== project.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingProjectId(project.id);
                    }}
                    className="absolute top-3 right-3 z-20 p-2 bg-black/60 hover:bg-red-500/80 backdrop-blur-md rounded-lg text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                    title="删除项目"
                  >
                    <Trash2 size={16} />
                  </button>
                )}

                {/* 复制图标 - 右下角 */}
                {deletingProjectId !== project.id && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      // 复制项目
                      const newProjectId = `project-${Date.now()}`;
                      const copiedProject = {
                        ...project,
                        id: newProjectId,
                        title: `${project.title || 'Untitled'} 副本`,
                        updatedAt: new Date().toISOString(),
                        // 深拷贝节点、连接和组
                        nodes: JSON.parse(JSON.stringify(project.nodes || [])),
                        connections: JSON.parse(JSON.stringify(project.connections || [])),
                        groups: JSON.parse(JSON.stringify(project.groups || []))
                      };
                      
                      const updatedProjects = [...projects, copiedProject];
                      setProjects(updatedProjects);
                      await saveToStorage('projects', updatedProjects);
                    }}
                    className="absolute bottom-3 right-3 z-20 p-2 bg-black/60 hover:bg-white/80 backdrop-blur-md rounded-lg text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                    title="复制项目"
                  >
                    <Copy size={16} />
                  </button>
                )}

                {/* 点击卡片打开项目 */}
                <div
                  onClick={(e) => {
                    // 如果正在编辑或删除，不打开项目
                    if (deletingProjectId === project.id || editingProjectId === project.id) {
                      return;
                    }
                    // 如果点击的是项目名称区域，不打开项目
                    if ((e.target as HTMLElement).closest('.project-title-area')) {
                      return;
                    }
                    // 如果点击的是复制按钮，不打开项目
                    if ((e.target as HTMLElement).closest('button[title="复制项目"]')) {
                      return;
                    }
                    setCurrentProjectId(project.id);
                    if (project.nodes) setNodes(project.nodes);
                    if (project.connections) setConnections(project.connections);
                    if (project.groups) setGroups(project.groups);
                    setViewMode('canvas');
                  }}
                  className="w-full h-full"
                >
                  {project.thumbnail ? (
                    <div className="w-full h-full relative">
                      <img src={project.thumbnail} alt={project.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                      <div className="text-6xl text-white/20">📄</div>
                    </div>
                  )}
                  
                  {/* 删除确认覆盖层 */}
                  {deletingProjectId === project.id && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-30">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-2">
                          <Trash2 size={24} className="text-red-400" />
                        </div>
                        <p className="text-sm font-medium text-white mb-4">确定要删除此项目吗？</p>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingProjectId(null);
                            }}
                            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg transition-all"
                          >
                            取消
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              // 删除项目
                              const updatedProjects = projects.filter(p => p.id !== project.id);
                              setProjects(updatedProjects);
                              await saveToStorage('projects', updatedProjects);
                              
                              // 如果删除的是当前项目，清空画布
                              if (currentProjectId === project.id) {
                                setCurrentProjectId(null);
                                setNodes([]);
                                setConnections([]);
                                setGroups([]);
                              }
                              
                              setDeletingProjectId(null);
                            }}
                            className="px-4 py-2 text-sm font-medium text-white bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 hover:border-red-500/70 rounded-lg transition-all shadow-[0_0_10px_rgba(239,68,68,0.2)] hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="absolute bottom-0 left-0 right-0 p-4 z-10 project-title-area" onClick={(e) => e.stopPropagation()} data-project-id={project.id}>
                    {editingProjectId === project.id ? (
                      <input
                        type="text"
                        value={editingProjectName}
                        onChange={(e) => setEditingProjectName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            saveProjectName(project.id, editingProjectName);
                          } else if (e.key === 'Escape') {
                            setEditingProjectId(null);
                            setEditingProjectName('');
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full text-sm font-semibold text-white bg-white/10 border border-white/50 rounded px-2 py-1 focus:outline-none focus:border-white mb-1"
                        autoFocus
                      />
                    ) : (
                      <h3 
                        className="text-sm font-semibold text-white mb-1 truncate cursor-text hover:text-white/80 transition-colors select-none"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setEditingProjectId(project.id);
                          setEditingProjectName(project.title || 'Untitled');
                        }}
                        onMouseDown={(e) => {
                          // 如果是双击的开始，阻止事件冒泡
                          if (e.detail === 2) {
                            e.stopPropagation();
                          }
                        }}
                        title="双击编辑项目名称"
                      >
                        {project.title || 'Untitled'}
                      </h3>
                    )}
                    <p className="text-xs text-slate-400">{new Date(project.updatedAt || Date.now()).toLocaleDateString('zh-CN')}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // API连接设置Modal
  const renderApiSettingsModal = () => {
    if (!isApiSettingsOpen) return null;
    
    return (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300"
        onClick={() => setIsApiSettingsOpen(false)}
      >
        <div
          className="bg-[#1c1c1e]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-6 max-w-md w-[90%] transition-all duration-300 scale-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <Unplug size={20} className="text-white/80" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">API 连接设置</h3>
              <p className="text-sm text-slate-400">配置您的 AI 服务连接</p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Base URL
              </label>
              <input
                type="text"
                value={aiConfig.baseUrl}
                onChange={(e) => setAiConfig({ ...aiConfig, baseUrl: e.target.value })}
                placeholder="https://api.openai.com"
                className="w-full px-4 py-3 bg-[#141414] border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-white/30 transition-all text-sm"
              />
              <p className="text-xs text-slate-500 mt-2">
                使用您的自定义 OneAPI/NewAPI 中转地址
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                API Key
              </label>
              <input
                type="password"
                value={aiConfig.apiKey}
                onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-4 py-3 bg-[#141414] border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-white/30 transition-all text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setIsApiSettingsOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={async () => {
                aiService.saveConfig({ baseUrl: aiConfig.baseUrl, apiKey: aiConfig.apiKey });
                await refreshAiModels();
                await fetchBalance();
                setIsApiSettingsOpen(false);
              }}
              disabled={loadingAiModels}
              className="px-4 py-2 text-sm font-medium text-white bg-white/20 hover:bg-white/30 border border-white/50 hover:border-white/70 rounded-lg transition-all duration-200 shadow-[0_0_10px_rgba(255,255,255,0.1)] hover:shadow-[0_0_15px_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingAiModels ? '连接中...' : '保存并刷新'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#0a0a0c]">
      {/* 左上角回到项目管理按钮 */}
      {viewMode === 'canvas' && (
        <button
          onClick={() => setViewMode('projects')}
          className="fixed top-6 left-6 z-50 p-2.5 bg-[#2c2c2e]/70 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl text-slate-400 hover:text-white/80 hover:border-white/30 hover:bg-white/10 transition-all duration-300 group"
          title="回到项目管理"
        >
          <House size={18} className="group-hover:scale-110 transition-transform" />
        </button>
      )}

      {/* 右上角删除画布按钮 */}
      {viewMode === 'canvas' && (
        <button
          onClick={() => setShowClearCanvasConfirm(true)}
          className="fixed top-6 right-6 z-50 p-2.5 bg-[#2c2c2e]/70 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl text-slate-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all duration-300 group"
          title="清空画布"
        >
          <Trash2 size={18} className="group-hover:scale-110 transition-transform" />
        </button>
      )}

      {/* 确认删除对话框 */}
      {showClearCanvasConfirm && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300"
          onClick={() => setShowClearCanvasConfirm(false)}
        >
          <div 
            className="bg-[#1c1c1e]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-6 max-w-md w-[90%] transition-all duration-300 scale-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">清空画布</h3>
                <p className="text-sm text-slate-400">此操作将删除所有节点、连接和分组</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-6">
              确定要清空整个画布吗？此操作无法撤销。
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowClearCanvasConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all duration-200"
              >
                取消
              </button>
              <button
                onClick={clearCanvas}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 hover:border-red-500/70 rounded-lg transition-all duration-200 shadow-[0_0_10px_rgba(239,68,68,0.2)] hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 根据视图模式显示不同内容 */}
      {viewMode === 'home' ? (
        <div 
          className="w-full h-full flex items-center justify-center bg-black relative overflow-hidden cursor-pointer"
          onClick={() => setViewMode('projects')}
          onKeyDown={(e) => {
            if (viewMode === 'home') {
              setViewMode('projects');
            }
          }}
          tabIndex={0}
        >
          {/* 主要内容 */}
          <div className="relative z-10 flex flex-col items-center justify-center">
            {/* 左侧彩色图标和标题 */}
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 relative">
                <svg viewBox="0 0 64 64" className="w-full h-full">
                  <defs>
                    <linearGradient id="iconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#fbbf24" />
                      <stop offset="25%" stopColor="#ec4899" />
                      <stop offset="50%" stopColor="#3b82f6" />
                      <stop offset="75%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M32 8 L40 24 L56 28 L44 40 L46 56 L32 48 L18 56 L20 40 L8 28 L24 24 Z"
                    fill="url(#iconGradient)"
                    className="animate-pulse"
                  />
                </svg>
              </div>
              
              {/* 标题文字 - 放大、全大写、上下渐变 */}
              <h1 
                className="text-9xl font-bold tracking-tight uppercase"
                style={{
                  background: 'linear-gradient(to bottom, #ffffff, #888888)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                SLATE IT!
              </h1>
            </div>
          </div>
        </div>
      ) : viewMode === 'projects' ? (
        <>
          {renderProjectManagement()}
          {renderApiSettingsModal()}
        </>
      ) : (
        <div 
          className={`w-full h-full relative ${isDraggingCanvas ? 'cursor-grabbing' : 'cursor-default'}`} 
          onMouseDown={(e) => { 
              isMouseDownRef.current = true;
              setIsMouseDown(true);
              // 清除任何残留的框选框
              if (selectionRect) {
                  setSelectionRect(null);
              }
              if(e.button === 0 && !e.shiftKey) { 
                  // 检查点击位置是否在节点上
                  const clickedOnNode = (e.target as HTMLElement).closest('[data-node-id]');
                  if (!clickedOnNode) {
                      // 不在节点上，开始框选（不清除已有选择，让框选逻辑处理）
                  setSelectionRect({ startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY }); 
                  } else {
                      // 在节点上点击，清除其他选择（节点点击会单独处理）
                      // 这里不清除，让节点点击逻辑处理
                  }
              } 
              if (e.button === 1 || (e.button === 0 && e.shiftKey)) { 
                  setIsDraggingCanvas(true); 
                  setLastMousePos({ x: e.clientX, y: e.clientY }); 
              } 
          }} 
          onWheel={(e) => { 
              if (e.ctrlKey || e.metaKey) { 
                  e.preventDefault(); 
                  const newScale = Math.min(Math.max(0.2, scale - e.deltaY * 0.001), 3); 
                  setScale(newScale); 
              } else { 
                  setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY })); 
              } 
          }}
          onContextMenu={(e) => {
              // 如果点击的是画布空白处，显示菜单
              const target = e.target as HTMLElement;
              if (target === e.currentTarget || 
                  (target.classList.contains('w-full') && target.classList.contains('h-full')) ||
                  target.closest('.w-full.h-full') === e.currentTarget) {
                  e.preventDefault();
                  setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id: '' });
                  setContextMenuTarget({ type: 'canvas', x: e.clientX, y: e.clientY });
              }
          }}
      >
          {/* 白点网格背景 - 跟随缩放和平移 */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 1px, transparent 1px)',
              backgroundSize: `${32 * scale}px ${32 * scale}px`,
              backgroundPosition: `${pan.x % (32 * scale)}px ${pan.y % (32 * scale)}px`,
            }}
          />
          <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: '0 0' }} className="w-full h-full relative">
              {groups.map(g => ( <div key={g.id} className={`absolute rounded-[32px] border ${selectedGroupId === g.id ? 'border-white/50 bg-white/5' : 'border-white/10 bg-white/5'}`} style={{ left: g.x, top: g.y, width: g.width, height: g.height }} onMouseDown={(e) => { e.stopPropagation(); setSelectedGroupId(g.id); const childNodes = nodes.filter(n => { const b = getNodeBounds(n); return b.x > g.x && b.r < g.x+g.width; }).map(n=>({id:n.id, startX:n.x, startY:n.y})); dragGroupRef.current = { id: g.id, startX: g.x, startY: g.y, mouseStartX: e.clientX, mouseStartY: e.clientY, childNodes }; }} /> ))}
              <svg className="absolute inset-0 overflow-visible" style={{ width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}>
                  {connections.map(c => {
                      const f=nodes.find(n=>n.id===c.from), t=nodes.find(n=>n.id===c.to); 
                      if(!f||!t) return null; 
                      
                      // 获取节点的实际DOM高度（更准确）
                      const fNodeElement = document.querySelector(`[data-node-id="${f.id}"]`) as HTMLElement;
                      const tNodeElement = document.querySelector(`[data-node-id="${t.id}"]`) as HTMLElement;
                      const fHeight = fNodeElement ? fNodeElement.offsetHeight : (f.height || getApproxNodeHeight(f));
                      const tHeight = tNodeElement ? tNodeElement.offsetHeight : (t.height || getApproxNodeHeight(t));
                      
                      // 计算端口中心位置：
                      // 端口使用 -left-3 和 -right-3，按钮大小 w-4 h-4 (16px)
                      // -left-3 = 按钮左边缘在节点左边缘左侧12px，按钮中心在 node.x - 12 + 8 = node.x - 4
                      // -right-3 = 按钮右边缘在节点右边缘右侧12px，按钮中心在 node.x + width + 12 - 8 = node.x + width + 4
                      const fromPortX = f.x + (f.width || 320) + 4; // output端口中心（节点右边缘 + 4px）
                      const fromPortY = f.y + fHeight / 2; // 节点垂直中心（使用实际DOM高度）
                      const toPortX = t.x - 4; // input端口中心（节点左边缘 - 4px）
                      const toPortY = t.y + tHeight / 2; // 节点垂直中心（使用实际DOM高度）
                      
                      // 创建一条更宽的透明路径用于点击检测
                      const pathId = `connection-${c.from}-${c.to}`;
                      return (
                          <g key={pathId}>
                              {/* 可点击的透明路径（更宽，便于点击） */}
                              <path 
                                  d={`M ${fromPortX} ${fromPortY} C ${fromPortX + 80} ${fromPortY} ${toPortX - 80} ${toPortY} ${toPortX} ${toPortY}`} 
                                  stroke="transparent" 
                                  strokeWidth="12" 
                                  fill="none"
                                  style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                  onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      // 断开连接
                                      saveHistory();
                                      setConnections(prev => prev.filter(conn => !(conn.from === c.from && conn.to === c.to)));
                                      // 从目标节点的inputs中移除源节点ID
                                      setNodes(prev => prev.map(n => 
                                          n.id === c.to 
                                              ? { ...n, inputs: n.inputs.filter(inputId => inputId !== c.from) }
                                              : n
                                      ));
                                  }}
                                  onMouseEnter={(e) => {
                                      // 悬停时显示半透明高亮
                                      e.currentTarget.style.stroke = 'rgba(255,255,255,0.2)';
                                  }}
                                  onMouseLeave={(e) => {
                                      e.currentTarget.style.stroke = 'transparent';
                                  }}
                                  title="双击断开连接"
                              />
                              {/* 实际显示的连接线 */}
                              <path 
                                  d={`M ${fromPortX} ${fromPortY} C ${fromPortX + 80} ${fromPortY} ${toPortX - 80} ${toPortY} ${toPortX} ${toPortY}`} 
                                  stroke="rgba(255,255,255,0.5)" 
                                  strokeWidth="3" 
                                  fill="none"
                                  style={{ pointerEvents: 'none' }}
                              />
                          </g>
                      );
                  })} 
                  {connectionStart && connectionEnd && (() => {
                      const node = nodes.find(n => n.id === connectionStart.id);
                      if (!node) return null;
                      
                      // 获取节点的实际DOM高度（更准确）
                      const nodeElement = document.querySelector(`[data-node-id="${node.id}"]`) as HTMLElement;
                      const nodeHeight = nodeElement ? nodeElement.offsetHeight : (node.height || getApproxNodeHeight(node));
                      const nodeWidth = node.width || 320;
                      
                      // 计算端口中心位置：
                      // 端口使用 -left-3 和 -right-3，按钮大小 w-4 h-4 (16px)
                      // -left-3 = 按钮左边缘在节点左边缘左侧12px，按钮中心在 node.x - 12 + 8 = node.x - 4
                      // -right-3 = 按钮右边缘在节点右边缘右侧12px，按钮中心在 node.x + width + 12 - 8 = node.x + width + 4
                      const startX = connectionStart.type === 'output' 
                          ? connectionStart.nodeX + nodeWidth + 4  // output端口中心：节点右边缘 + 12px(offset) - 8px(按钮中心) = +4px
                          : connectionStart.nodeX - 4;  // input端口中心：节点左边缘 - 12px(offset) + 8px(按钮中心) = -4px
                      const startY = connectionStart.nodeY + nodeHeight / 2;  // 节点垂直中心（使用实际DOM高度）
                      const endX = connectionEnd.x;
                      const endY = connectionEnd.y;
                      return <path d={`M ${startX} ${startY} C ${startX + 80} ${startY} ${endX - 80} ${endY} ${endX} ${endY}`} stroke="rgba(255,255,255,0.8)" strokeWidth="3" fill="none" strokeDasharray="5,5" />;
                  })()}
              </svg>
              {nodes.map(n => {
                  // 优先从 config.ts 获取模型配置，如果没有则回退到 AIService
                  let specificModels: string[] = [];
                  const configModels = getModelsFromConfig(n.type);
                  
                  if (configModels.length > 0) {
                      // 优先使用 config.ts 中的模型配置
                      specificModels = configModels;
                  } else {
                      // 回退到 AIService 的模型列表
                      if (n.type === NodeType.IMAGE_GENERATOR || n.type === NodeType.IMAGE_EDITOR) {
                          specificModels = aiModels.image;
                      } else if (n.type === NodeType.VIDEO_GENERATOR || n.type === NodeType.VIDEO_ANALYZER) {
                          specificModels = aiModels.video;
                      } else if (n.type === NodeType.PROMPT_INPUT) {
                          specificModels = aiModels.text;
                      }
                  }
                  
                  return (
                  <Node 
                      key={n.id} 
                      node={n} 
                      onUpdate={handleNodeUpdate} 
                      onAction={handleNodeAction} 
                      onDelete={deleteNodes as any} 
                      isDragging={draggingNodeId === n.id || (draggingNodeId && dragNodeRef.current?.selectedNodeIds?.includes(n.id))}
                      availableAiModels={specificModels}
                      onNodeMouseDown={(e, id) => { 
                          e.stopPropagation(); 
                          
                          // 检查是否按住 Shift 键进行多选
                          const isShiftPressed = e.shiftKey;
                          let newSelectedIds: string[];
                          
                          if (isShiftPressed) {
                              // Shift + 点击：切换选中状态
                              if (selectedNodeIds.includes(id)) {
                                  // 如果已选中，则取消选中（但至少保留一个）
                                  newSelectedIds = selectedNodeIds.filter(selectedId => selectedId !== id);
                                  if (newSelectedIds.length === 0) {
                                      newSelectedIds = [id]; // 至少保留一个
                                  }
                              } else {
                                  // 如果未选中，则添加到选中列表
                                  newSelectedIds = [...selectedNodeIds, id];
                              }
                          } else {
                              // 普通点击：如果点击的节点已经在选中列表中，保持选中；否则只选中当前节点
                              if (selectedNodeIds.includes(id) && selectedNodeIds.length > 1) {
                                  // 如果点击的是已选中的节点之一，且有多选，保持所有选中
                                  newSelectedIds = selectedNodeIds;
                              } else {
                                  // 否则只选中当前节点
                                  newSelectedIds = [id];
                              }
                          }
                          
                          setSelectedNodeIds(newSelectedIds);
                          
                          const node=nodes.find(x=>x.id===id); 
                          if(node) {
                            // 如果有多选，存储所有选中节点的初始位置
                            let selectedNodesStartPos: Map<string, { x: number, y: number }> | undefined;
                            if (newSelectedIds.length > 1) {
                                selectedNodesStartPos = new Map();
                                nodes.filter(n => newSelectedIds.includes(n.id)).forEach(n => {
                                    selectedNodesStartPos!.set(n.id, { x: n.x, y: n.y });
                                });
                            }
                            
                            dragNodeRef.current = {
                              id: id, 
                              startX: node.x, 
                              startY: node.y, 
                              mouseStartX: e.clientX, 
                              mouseStartY: e.clientY, 
                              nodeWidth: node.width || 320, 
                              nodeHeight: node.height || 300,
                              siblingNodeIds: [],
                              parentGroupId: null,
                              selectedNodeIds: newSelectedIds.length > 1 ? newSelectedIds : undefined,
                              selectedNodesStartPos: selectedNodesStartPos
                            };
                          } 
                          setDraggingNodeId(id); 
                      }} 
                      onPortMouseDown={(e, id, type) => { 
                          e.stopPropagation(); 
                          e.preventDefault();
                          const node = nodes.find(x => x.id === id);
                          if (node) {
                              setConnectionStart({ 
                                  id, 
                                  x: e.clientX, 
                                  y: e.clientY, 
                                  type,
                                  nodeX: node.x,
                                  nodeY: node.y
                              }); 
                          }
                      }} 
                      onPortMouseUp={(e, id, type) => { 
                          e.stopPropagation(); 
                          e.preventDefault();
                          // 如果已经在连接状态，检查是否可以连接
                          if (connectionStartRef.current && connectionStartRef.current.id !== id && connectionStartRef.current.type !== type) {
                              const fromId = connectionStartRef.current.type === 'output' ? connectionStartRef.current.id : id;
                              const toId = connectionStartRef.current.type === 'output' ? id : connectionStartRef.current.id;
                              if (!connectionsRef.current.find(c => c.from === fromId && c.to === toId)) {
                                  saveHistory();
                                  setConnections(p => [...p, { from: fromId, to: toId }]);
                                  setNodes(p => {
                                      const updated = p.map(x => {
                                          if (x.id === toId) {
                                              // 确保输入ID不重复
                                              const newInputs = x.inputs.includes(fromId) ? x.inputs : [...x.inputs, fromId];
                                              return { ...x, inputs: newInputs };
                                          }
                                          return x;
                                      });
                                      return updated;
                                  });
                              }
                              setConnectionStart(null);
                              setConnectionEnd(null);
                          }
                      }} 
                      isSelected={selectedNodeIds.includes(n.id)} 
                      isConnecting={connectionStart?.id === n.id}
                      inputAssets={getInputAssets(n)}
                      onInputReorder={handleInputReorder}
                      onExpand={setExpandedMedia} 
                      onCrop={(id, img) => { setCroppingNodeId(id); setImageToCrop(img); }} 
                      onResizeMouseDown={(e, id, w, h) => {}} 
                      onNodeContextMenu={(e, id) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id });
                          setContextMenuTarget({ type: 'node', id });
                      }} 
                  />
                  );
              })}
              {/* 框选框 - 只在鼠标按下时显示 */}
              {selectionRect && isMouseDown && isMouseDownRef.current && (
                  <div 
                      className="absolute border border-white/40 bg-white/10 rounded-lg pointer-events-none" 
                      style={{ 
                          left: (Math.min(selectionRect.startX, selectionRect.currentX) - pan.x) / scale, 
                          top: (Math.min(selectionRect.startY, selectionRect.currentY) - pan.y) / scale, 
                          width: Math.abs(selectionRect.currentX - selectionRect.startX) / scale, 
                          height: Math.abs(selectionRect.currentY - selectionRect.startY) / scale 
                      }} 
                  />
              )}
          </div>
          {/* 连接菜单 - 从输出端口拉出连接线时显示 */}
          {connectionMenu && connectionStart && (
              <div 
                  data-connection-menu
                  className="fixed z-[200] bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden min-w-[240px]"
                  style={{ left: connectionMenu.x, top: connectionMenu.y }}
                  onMouseDown={(e) => e.stopPropagation()}
              >
                  <div className="px-4 py-2 text-xs text-slate-400 border-b border-white/5">引用该节点生成</div>
                  <div className="p-2">
                      {[
                          { type: NodeType.PROMPT_INPUT, label: '文本生成', desc: '脚本、广告词、品牌文案', icon: Type },
                          { type: NodeType.IMAGE_GENERATOR, label: '图片生成', desc: '', icon: ImageIcon },
                          { type: NodeType.VIDEO_GENERATOR, label: '视频生成', desc: '', icon: VideoIcon },
                          { type: NodeType.IMAGE_EDITOR, label: '图片编辑器', desc: '', icon: Brush },
                      ].map((item, idx) => {
                          const Icon = item.icon;
                          return (
                              <div
                                  key={item.type}
                                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-white/5 transition-colors group"
                                  onClick={() => {
                                      if (connectionMenu && connectionStart) {
                                          const endX = (connectionMenu.x - pan.x) / scale;
                                          const endY = (connectionMenu.y - pan.y) / scale;
                                          const fromId = connectionMenu.fromId;
                                          
                                          // 先保存历史
                                          saveHistory();
                                          
                                          // 创建新节点
                                          const newNodeId = `n-${Date.now()}-${Math.floor(Math.random()*1000)}`;
                                          const safeX = isNaN(endX - 210) ? 100 : endX - 210;
                                          const safeY = isNaN(endY - 150) ? 100 : endY - 150;
                                          
                                          const defaults: any = { 
                                              model: item.type === NodeType.VIDEO_GENERATOR ? 'veo-3.1-fast-generate-preview' : 
                                                      item.type === NodeType.IMAGE_EDITOR ? 'gemini-2.5-flash-image' : 
                                                      item.type.includes('IMAGE') ? 'gemini-2.5-flash-image' : 'gemini-3-pro-preview',
                                              generationMode: item.type === NodeType.VIDEO_GENERATOR ? 'DEFAULT' : undefined
                                          };
                                          
                                          const newNode: AppNode = { 
                                              id: newNodeId, 
                                              type: item.type, 
                                              x: safeX, 
                                              y: safeY, 
                                              width: 320, 
                                              title: getNodeNameCN(item.type), 
                                              status: NodeStatus.IDLE, 
                                              data: defaults, 
                                              inputs: [fromId] // 直接设置输入连接
                                          };
                                          
                                          // 添加节点和连接
                                          setNodes(prev => [...prev, newNode]);
                                          setConnections(prev => [...prev, { from: fromId, to: newNodeId }]);
                                          
                                          // 清理连接状态
                                          setConnectionStart(null);
                                          setConnectionEnd(null);
                                          setConnectionMenu(null);
                                      }
                                  }}
                              >
                                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                                      <Icon size={20} className="text-white/70" />
                                  </div>
                                  <div className="flex-1">
                                      <div className="text-sm text-white font-medium">{item.label}</div>
                                      {item.desc && <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>}
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
          )}
          <SidebarDock onAddNode={addNode} onUndo={undo} isChatOpen={isChatOpen} onToggleChat={() => setIsChatOpen(!isChatOpen)} isMultiFrameOpen={isMultiFrameOpen} onToggleMultiFrame={() => setIsMultiFrameOpen(!isMultiFrameOpen)} isSonicStudioOpen={isSonicStudioOpen} onToggleSonicStudio={() => setIsSonicStudioOpen(!isSonicStudioOpen)} assetHistory={assetHistory} onHistoryItemClick={() => {}} onDeleteAsset={() => {}} workflows={workflows} selectedWorkflowId={selectedWorkflowId} onSelectWorkflow={loadWorkflow as any} onSaveWorkflow={saveCurrentAsWorkflow} onDeleteWorkflow={deleteWorkflow as any} onRenameWorkflow={renameWorkflow as any} onOpenSettings={() => setIsApiSettingsOpen(true)} />
          <AssistantPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
          <SmartSequenceDock isOpen={isMultiFrameOpen} onClose={() => setIsMultiFrameOpen(false)} onGenerate={handleMultiFrameGenerate} />
          <SonicStudio isOpen={isSonicStudioOpen} onClose={() => setIsSonicStudioOpen(false)} history={assetHistory.filter(a => a.type === 'audio')} onGenerate={(src, prompt) => handleAssetGenerated('audio', src, prompt)} />
          {renderApiSettingsModal()}
          {croppingNodeId && imageToCrop && <ImageCropper imageSrc={imageToCrop} onCancel={() => {setCroppingNodeId(null); setImageToCrop(null);}} onConfirm={(b) => {handleNodeUpdate(croppingNodeId, {croppedFrame: b}); setCroppingNodeId(null); setImageToCrop(null);}} />}
          <ExpandedView media={expandedMedia} onClose={() => setExpandedMedia(null)} />
          {isSketchEditorOpen && <SketchEditor onClose={() => setIsSketchEditorOpen(false)} onGenerate={handleSketchResult} />}
          
          {/* 画布右键菜单 */}
          {contextMenu && contextMenuTarget?.type === 'canvas' && (
              <div 
                  data-context-menu
                  className="fixed z-[200] bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl backdrop-blur-xl overflow-hidden min-w-[180px]"
                  style={{ top: contextMenu.y, left: contextMenu.x }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
              >
                  <div className="py-1">
                      {/* 上传 */}
                      <button 
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                          onClick={() => {
                              uploadFileInputRef.current?.click();
                              setContextMenu(null);
                          }}
                      >
                          <Upload size={14} className="text-slate-400" />
                          <span>上传</span>
                      </button>
                      
                      {/* 添加资产 */}
                      <button 
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                          onClick={() => {
                              // 可以打开资产面板或添加资产功能
                              setContextMenu(null);
                          }}
                      >
                          <FolderPlus size={14} className="text-slate-400" />
                          <span>添加资产</span>
                      </button>
                      
                      {/* 添加节点 */}
                      <button 
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                          onClick={() => {
                              const x = (contextMenuTarget.x - pan.x) / scale;
                              const y = (contextMenuTarget.y - pan.y) / scale;
                              // 显示节点类型选择菜单（可以复用连接菜单的逻辑）
                              setContextMenu(null);
                              setContextMenu({ visible: true, x: contextMenuTarget.x, y: contextMenuTarget.y + 120, id: '' });
                              setContextMenuTarget({ type: 'addNode', x: contextMenuTarget.x, y: contextMenuTarget.y });
                          }}
                      >
                          <Plus size={14} className="text-slate-400" />
                          <span>添加节点</span>
                      </button>
                      
                      {/* 分隔线 */}
                      <div className="h-px bg-white/5 my-1"></div>
                      
                      {/* 撤销 */}
                      <button 
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors flex items-center justify-between"
                          onClick={() => {
                              undo();
                              setContextMenu(null);
                          }}
                      >
                          <div className="flex items-center gap-2">
                              <Undo2 size={14} className="text-slate-400" />
                              <span>撤销</span>
                          </div>
                          <span className="text-xs text-slate-500">⌘Z</span>
                      </button>
                      
                      {/* 重做 */}
                      <button 
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors flex items-center justify-between"
                          onClick={() => {
                              redo();
                              setContextMenu(null);
                          }}
                      >
                          <div className="flex items-center gap-2">
                              <Redo2 size={14} className="text-slate-400" />
                              <span>重做</span>
                          </div>
                          <span className="text-xs text-slate-500">⇧⌘Z</span>
                      </button>
                      
                      {/* 分隔线 */}
                      <div className="h-px bg-white/5 my-1"></div>
                      
                      {/* 粘贴 */}
                      <button 
                          className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                              clipboard ? 'text-white hover:bg-white/5' : 'text-slate-500 cursor-not-allowed'
                          }`}
                          onClick={() => {
                              if (clipboard) {
                                  const x = (contextMenuTarget.x - pan.x) / scale;
                                  const y = (contextMenuTarget.y - pan.y) / scale;
                                  const newNode = {
                                      ...clipboard,
                                      id: `n-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                                      x: x - 210,
                                      y: y - 150,
                                      inputs: []
                                  };
                                  saveHistory();
                                  setNodes(prev => [...prev, newNode]);
                                  setContextMenu(null);
                              }
                          }}
                          disabled={!clipboard}
                      >
                          <div className="flex items-center gap-2">
                              <Clipboard size={14} className="text-slate-400" />
                              <span>粘贴</span>
                          </div>
                          <span className="text-xs text-slate-500">⌘V</span>
                      </button>
                  </div>
              </div>
          )}
          
          {/* 添加节点子菜单 */}
          {contextMenu && contextMenuTarget?.type === 'addNode' && (
              <div 
                  data-context-menu
                  className="fixed z-[200] bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl backdrop-blur-xl overflow-hidden min-w-[180px]"
                  style={{ top: contextMenu.y, left: contextMenu.x }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
              >
                  <div className="py-1">
                      {[NodeType.PROMPT_INPUT, NodeType.IMAGE_GENERATOR, NodeType.VIDEO_GENERATOR, NodeType.AUDIO_GENERATOR, NodeType.VIDEO_ANALYZER, NodeType.IMAGE_EDITOR].map(t => {
                          const ItemIcon = getNodeIcon(t);
                          return (
                              <button 
                                  key={t}
                                  className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                                  onClick={() => {
                                      const x = (contextMenuTarget.x - pan.x) / scale;
                                      const y = (contextMenuTarget.y - pan.y) / scale;
                                      addNode(t, x - 210, y - 150);
                                      setContextMenu(null);
                                  }}
                              >
                                  <ItemIcon size={14} className="text-cyan-400" />
                                  <span>{getNodeNameCN(t)}</span>
                              </button>
                          );
                      })}
                  </div>
              </div>
          )}
          
          {/* 节点右键菜单 */}
          {contextMenu && contextMenuTarget?.type === 'node' && (
              <div 
                  data-context-menu
                  className="fixed z-[200] bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl backdrop-blur-xl overflow-hidden min-w-[200px]"
                  style={{ top: contextMenu.y, left: contextMenu.x }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
              >
                  <div className="px-3 py-2 text-xs text-slate-400 border-b border-white/5">创建资产</div>
                  <div className="py-1">
                      {/* 复制 */}
                      <button 
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors flex items-center justify-between"
                          onClick={() => {
                              const targetNode = nodes.find(n => n.id === contextMenuTarget.id);
                              if (targetNode) {
                                  setClipboard(JSON.parse(JSON.stringify(targetNode)));
                              }
                              setContextMenu(null);
                          }}
                      >
                          <div className="flex items-center gap-2">
                              <Copy size={14} className="text-slate-400" />
                              <span>复制</span>
                          </div>
                          <span className="text-xs text-slate-500">⌘C</span>
                      </button>
                      
                      {/* 粘贴 */}
                      <button 
                          className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                              clipboard ? 'text-white hover:bg-white/5' : 'text-slate-500 cursor-not-allowed'
                          }`}
                          onClick={() => {
                              if (clipboard) {
                                  const targetNode = nodes.find(n => n.id === contextMenuTarget.id);
                                  if (targetNode) {
                                      const newNode = {
                                          ...clipboard,
                                          id: `n-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                                          x: targetNode.x + 50,
                                          y: targetNode.y + 50,
                                          inputs: []
                                      };
                                      saveHistory();
                                      setNodes(prev => [...prev, newNode]);
                                  }
                              }
                              setContextMenu(null);
                          }}
                          disabled={!clipboard}
                      >
                          <div className="flex items-center gap-2">
                              <Clipboard size={14} className="text-slate-400" />
                              <span>粘贴</span>
                          </div>
                          <span className="text-xs text-slate-500">⌘V</span>
                      </button>
                      
                      {/* 副本 */}
                      <button 
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                          onClick={() => {
                              const targetNode = nodes.find(n => n.id === contextMenuTarget.id);
                              if (targetNode) {
                                  const newNode = {
                                      ...targetNode,
                                      id: `n-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                                      x: targetNode.x + 50,
                                      y: targetNode.y + 50,
                                      inputs: []
                                  };
                                  saveHistory();
                                  setNodes(prev => [...prev, newNode]);
                              }
                              setContextMenu(null);
                          }}
                      >
                          <Copy size={14} className="text-slate-400" />
                          <span>副本</span>
                      </button>
                      
                      {/* 删除 */}
                      <button 
                          className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors flex items-center justify-between"
                          onClick={() => {
                              deleteNodes([contextMenuTarget.id]);
                              setContextMenu(null);
                          }}
                      >
                          <div className="flex items-center gap-2">
                              <Trash2 size={14} />
                              <span>删除</span>
                          </div>
                          <span className="text-xs text-slate-500">⌘⌫</span>
                      </button>
                      
                      {/* 分隔线 */}
                      <div className="h-px bg-white/5 my-1"></div>
                      
                      {/* 复制到剪贴板 */}
                      <button 
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                          onClick={async () => {
                              const targetNode = nodes.find(n => n.id === contextMenuTarget.id);
                              if (targetNode) {
                                  try {
                                      // 如果有图片或视频，复制到系统剪贴板
                                      if (targetNode.data.image) {
                                          const response = await fetch(targetNode.data.image);
                                          const blob = await response.blob();
                                          await navigator.clipboard.write([
                                              new ClipboardItem({ [blob.type]: blob })
                                          ]);
                                      } else if (targetNode.data.videoUri) {
                                          const response = await fetch(targetNode.data.videoUri);
                                          const blob = await response.blob();
                                          await navigator.clipboard.write([
                                              new ClipboardItem({ [blob.type]: blob })
                                          ]);
                                      } else {
                                          // 复制节点数据为文本
                                          await navigator.clipboard.writeText(JSON.stringify(targetNode, null, 2));
                                      }
                                  } catch (e) {
                                      console.error('Failed to copy to clipboard:', e);
                                  }
                              }
                              setContextMenu(null);
                          }}
                      >
                          <Clipboard size={14} className="text-slate-400" />
                          <span>复制到剪贴板</span>
                      </button>
                  </div>
              </div>
          )}
          
          {/* 隐藏的文件上传输入 */}
          <input 
              type="file" 
              ref={uploadFileInputRef} 
              className="hidden" 
              accept="image/*,video/*" 
              multiple
              onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  files.forEach(file => {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                          const result = event.target?.result as string;
                          const type = file.type.startsWith('image/') ? 'image' : 'video';
                          const x = contextMenuTarget?.x ? (contextMenuTarget.x - pan.x) / scale : (-pan.x + window.innerWidth/2)/scale - 210;
                          const y = contextMenuTarget?.y ? (contextMenuTarget.y - pan.y) / scale : (-pan.y + window.innerHeight/2)/scale - 180;
                          
                          if (type === 'image') {
                              addNode(NodeType.IMAGE_GENERATOR, x, y, { image: result, status: NodeStatus.SUCCESS });
                          } else {
                              addNode(NodeType.VIDEO_GENERATOR, x, y, { videoUri: result, status: NodeStatus.SUCCESS });
                          }
                          handleAssetGenerated(type, result, file.name);
                      };
                      reader.readAsDataURL(file);
                  });
                  if (e.target) e.target.value = '';
              }}
          />
        </div>
      )}

      {/* 左下角缩放和快捷键控件 */}
      {viewMode === 'canvas' && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2">
          {/* 缩放滑块 */}
          <div className="flex items-center gap-2 bg-[#2c2c2e]/70 backdrop-blur-2xl border border-white/10 rounded-lg shadow-2xl px-3 py-2">
            <ZoomIn size={14} className="text-slate-400" />
            <input
              type="range"
              min="0.2"
              max="3"
              step="0.1"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-24 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer slider-thumb"
              style={{
                background: `linear-gradient(to right, rgb(6, 182, 212) 0%, rgb(6, 182, 212) ${((scale - 0.2) / (3 - 0.2)) * 100}%, rgba(255, 255, 255, 0.1) ${((scale - 0.2) / (3 - 0.2)) * 100}%, rgba(255, 255, 255, 0.1) 100%)`
              }}
            />
            <span className="text-[10px] text-slate-400 font-medium min-w-[2.5rem] text-right">
              {Math.round(scale * 100)}%
            </span>
          </div>

          {/* 快捷键按钮 */}
          <button
            onClick={() => setShowShortcutsModal(true)}
            className="p-2 bg-[#2c2c2e]/70 backdrop-blur-2xl border border-white/10 rounded-lg shadow-2xl text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 hover:bg-cyan-500/10 transition-all duration-300"
            title="快捷键"
          >
            <HelpCircle size={14} />
          </button>
        </div>
      )}

      {/* 快捷键模态框 */}
      {showShortcutsModal && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowShortcutsModal(false)}
        >
          <div 
            className="bg-[#1c1c1e]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-6 max-w-md w-[90%] max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Info size={20} className="text-cyan-400" />
                快捷键
              </h2>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wide">画布操作</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-slate-300">拖动画布</span>
                    <kbd className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-slate-300 font-mono">鼠标中键 / 空格 + 拖拽</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-slate-300">缩放画布</span>
                    <kbd className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-slate-300 font-mono">滚轮</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-slate-300">适应视图</span>
                    <kbd className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-slate-300 font-mono">F</kbd>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wide">节点操作</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-slate-300">多选节点</span>
                    <kbd className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-slate-300 font-mono">Shift + 点击</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-slate-300">框选节点</span>
                    <kbd className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-slate-300 font-mono">左键拖拽</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-slate-300">删除节点</span>
                    <kbd className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-slate-300 font-mono">Delete / Backspace</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-slate-300">复制节点</span>
                    <kbd className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-slate-300 font-mono">Ctrl + C</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-slate-300">粘贴节点</span>
                    <kbd className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-slate-300 font-mono">Ctrl + V</kbd>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wide">编辑操作</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-slate-300">撤销</span>
                    <kbd className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-slate-300 font-mono">Ctrl + Z</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-slate-300">重做</span>
                    <kbd className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-slate-300 font-mono">Ctrl + Shift + Z</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-slate-300">全选</span>
                    <kbd className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-slate-300 font-mono">Ctrl + A</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-slate-300">取消选择</span>
                    <kbd className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-slate-300 font-mono">Esc</kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

