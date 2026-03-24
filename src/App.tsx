import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, Save, RefreshCw, Plus, FileText, Trash2, X, Check,
  Bold, Italic, Strikethrough, Heading, List, ListOrdered, Link as LinkIcon, Image as ImageIcon, Code, Quote,
  Moon, Sun, Highlighter
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import { LivePreviewEditor } from './components/LivePreviewEditor';
import { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { 
  initWebDAV, 
  listNotes, 
  readNote, 
  writeNote, 
  deleteNote, 
  testConnection,
  getWebDAVClient,
  WebDAVConfig 
} from './lib/webdav';

// --- Types ---
interface Note {
  filename: string;
  content: string;
  lastmod?: string;
  isLocalOnly?: boolean;
  isDirty?: boolean;
}

// Custom remark plugin to handle ==highlight== syntax
const remarkHighlight = () => {
  return (tree: any) => {
    const visit = (node: any) => {
      if (node.children) {
        const newChildren: any[] = [];
        node.children.forEach((child: any) => {
          if (child.type === 'text') {
            const regex = /==(.+?)==/g;
            let lastIndex = 0;
            let match;
            let hasMatch = false;

            while ((match = regex.exec(child.value)) !== null) {
              hasMatch = true;
              if (match.index > lastIndex) {
                newChildren.push({ type: 'text', value: child.value.slice(lastIndex, match.index) });
              }
              newChildren.push({
                type: 'emphasis',
                data: { hName: 'mark' },
                children: [{ type: 'text', value: match[1] }]
              });
              lastIndex = regex.lastIndex;
            }

            if (hasMatch) {
              if (lastIndex < child.value.length) {
                newChildren.push({ type: 'text', value: child.value.slice(lastIndex) });
              }
            } else {
              newChildren.push(child);
            }
          } else {
            newChildren.push(child);
            visit(child);
          }
        });
        node.children = newChildren;
      }
    };
    visit(tree);
  };
};

// --- Main App Component ---
export default function App() {
  const [config, setConfig] = useState<WebDAVConfig>(() => {
    const saved = localStorage.getItem('webdav_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.useProxy === undefined) parsed.useProxy = true;
        if (parsed.rememberPassword === undefined) parsed.rememberPassword = true;
        return parsed;
      } catch (e) {
        // ignore parse error
      }
    }
    return { url: '', username: '', password: '', directory: '/notes', rememberPassword: true, useProxy: true };
  });
  
  const [showSettings, setShowSettings] = useState(!config.url);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [editMode, setEditMode] = useState<'edit' | 'preview'>('edit');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') || 
             localStorage.getItem('theme') === 'dark' ||
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const handleTestConnection = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const form = e.currentTarget.closest('form');
    if (!form) return;
    
    if (!form.reportValidity()) return;

    const formData = new FormData(form);

    let dir = formData.get('directory') as string || '/notes';
    if (!dir.startsWith('/')) {
      dir = '/' + dir;
    }

    const testConfig: WebDAVConfig = {
      url: formData.get('url') as string,
      username: formData.get('username') as string,
      password: formData.get('password') as string,
      directory: dir,
      rememberPassword: formData.get('rememberPassword') === 'on',
      useProxy: formData.get('useProxy') === 'on',
    };

    setIsTestingConnection(true);
    try {
      await testConnection(testConfig);
      toast.success('连接测试成功！');
    } catch (error: any) {
      console.error(error);
      toast.error(`连接测试失败: ${error.message || '请检查地址、凭据或代理设置'}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    if (!editorRef.current?.view || !activeNote) return;
    
    const view = editorRef.current.view;
    const selection = view.state.selection.main;
    const text = view.state.sliceDoc(selection.from, selection.to);
    const newContent = `${prefix}${text}${suffix}`;
    
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: newContent },
      selection: { anchor: selection.from + prefix.length, head: selection.from + prefix.length + text.length }
    });
    view.focus();
  };

  // Initialize WebDAV client when config changes
  useEffect(() => {
    if (config.url) {
      initWebDAV(config);
      fetchNotes();
    }
  }, [config.url, config.username, config.password, config.directory, config.useProxy]);

  // Auto-save local changes to WebDAV (debounced)
  useEffect(() => {
    if (!activeNote || !activeNote.isDirty || !config.url) return;

    const timer = setTimeout(async () => {
      try {
        setIsSyncing(true);
        const path = `${config.directory.replace(/\/$/, '')}/${activeNote.filename}`;
        await writeNote(path, activeNote.content);
        
        setNotes(prev => prev.map(n => 
          n.filename === activeNote.filename 
            ? { ...n, isDirty: false, lastmod: new Date().toISOString() } 
            : n
        ));
        setActiveNote(prev => prev ? { ...prev, isDirty: false } : null);
      } catch (error) {
        console.error(error);
        toast.error('自动保存笔记失败');
      } finally {
        setIsSyncing(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [activeNote?.content, activeNote?.isDirty]);

  const fetchNotes = async () => {
    if (!config.url) return;
    setIsLoading(true);
    try {
      const remoteNotes = await listNotes(config.directory);
      setNotes(remoteNotes.map(n => ({ ...n, content: '' })));
      toast.success('笔记同步成功');
    } catch (error: any) {
      console.error(error);
      toast.error(`同步失败: ${error.message || '请检查 CORS 或凭据'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectNote = async (note: Note) => {
    if (activeNote?.isDirty) {
      // Force save current before switching
      try {
        const path = `${config.directory.replace(/\/$/, '')}/${activeNote.filename}`;
        await writeNote(path, activeNote.content);
      } catch (e) {
        toast.error('切换前保存当前笔记失败');
      }
    }

    if (!note.content && !note.isLocalOnly) {
      setIsLoading(true);
      try {
        const path = `${config.directory.replace(/\/$/, '')}/${note.filename}`;
        const content = await readNote(path);
        const loadedNote = { ...note, content };
        setActiveNote(loadedNote);
        setNotes(prev => prev.map(n => n.filename === note.filename ? loadedNote : n));
      } catch (error) {
        toast.error('加载笔记内容失败');
      } finally {
        setIsLoading(false);
      }
    } else {
      setActiveNote(note);
    }
  };

  const handleCreateNote = () => {
    const filename = `笔记_${format(new Date(), 'yyyyMMdd_HHmmss')}.md`;
    const newNote: Note = {
      filename,
      content: '# 新笔记\n\n',
      isLocalOnly: true,
      isDirty: true,
      lastmod: new Date().toISOString()
    };
    setNotes([newNote, ...notes]);
    setActiveNote(newNote);
    setEditMode('edit');
  };

  const handleDeleteNote = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    toast('确定要删除此笔记吗？', {
      action: {
        label: '删除',
        onClick: async () => {
          try {
            setIsSyncing(true);
            const noteToDelete = notes.find(n => n.filename === filename);
            
            if (noteToDelete && !noteToDelete.isLocalOnly) {
              const path = `${config.directory.replace(/\/$/, '')}/${filename}`;
              await deleteNote(path);
            }
            
            setNotes(prev => prev.filter(n => n.filename !== filename));
            if (activeNote?.filename === filename) {
              setActiveNote(null);
            }
            toast.success('笔记已删除');
          } catch (error) {
            console.error(error);
            toast.error('删除笔记失败');
          } finally {
            setIsSyncing(false);
          }
        },
      },
      cancel: {
        label: '取消',
        onClick: () => {},
      },
    });
  };

  const handleRenameNote = async (newFilename: string) => {
    if (!activeNote || newFilename === activeNote.filename.replace('.md', '')) return;
    
    const newFilenameWithExt = newFilename.endsWith('.md') ? newFilename : `${newFilename}.md`;
    
    // Check if file already exists
    if (notes.some(n => n.filename === newFilenameWithExt)) {
      toast.error('文件名已存在');
      return;
    }

    try {
      setIsSyncing(true);
      const oldPath = `${config.directory.replace(/\/$/, '')}/${activeNote.filename}`;
      const newPath = `${config.directory.replace(/\/$/, '')}/${newFilenameWithExt}`;
      
      if (!activeNote.isLocalOnly) {
        // If it's on the server, we need to move it
        const client = getWebDAVClient();
        if (client) {
          await client.moveFile(oldPath, newPath);
        }
      }
      
      // Update local state
      const updatedNote = { ...activeNote, filename: newFilenameWithExt };
      setActiveNote(updatedNote);
      setNotes(prev => prev.map(n => 
        n.filename === activeNote.filename ? updatedNote : n
      ));
      
      toast.success('重命名成功');
    } catch (error) {
      console.error(error);
      toast.error('重命名失败');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleContentChange = (newContent: string) => {
    if (!activeNote) return;
    setActiveNote({ ...activeNote, content: newContent, isDirty: true });
    setNotes(prev => prev.map(n => 
      n.filename === activeNote.filename 
        ? { ...n, content: newContent, isDirty: true } 
        : n
    ));
  };

  const saveConfig = (newConfig: WebDAVConfig) => {
    setConfig(newConfig);
    const configToSave = { ...newConfig };
    if (!newConfig.rememberPassword) {
      configToSave.password = '';
    }
    localStorage.setItem('webdav_config', JSON.stringify(configToSave));
    setShowSettings(false);
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      <Toaster position="top-center" />
      
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-muted/30 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h1 className="font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4" />
            md速记
          </h1>
          <div className="flex gap-1">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)} 
              className="p-1.5 hover:bg-muted rounded-md transition-colors"
              title={isDarkMode ? "切换到浅色模式" : "切换到深色模式"}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button 
              onClick={fetchNotes} 
              className="p-1.5 hover:bg-muted rounded-md transition-colors"
              title="同步笔记"
              disabled={isLoading || !config.url}
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </button>
            <button 
              onClick={() => setShowSettings(true)} 
              className="p-1.5 hover:bg-muted rounded-md transition-colors"
              title="设置"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="p-2">
          <button 
            onClick={handleCreateNote}
            disabled={!config.url}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 px-4 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            新建笔记
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {notes.length === 0 && !isLoading && (
            <div className="text-center text-sm text-muted-foreground p-4">
              未找到笔记。请新建一个或检查 WebDAV 设置。
            </div>
          )}
          {notes.map(note => (
            <div 
              key={note.filename}
              onClick={() => handleSelectNote(note)}
              className={cn(
                "group flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors text-sm",
                activeNote?.filename === note.filename ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              )}
            >
              <div className="truncate flex-1">
                {note.filename.replace('.md', '')}
                {note.isDirty && <span className="ml-2 w-2 h-2 rounded-full bg-blue-500 inline-block" />}
              </div>
              <button 
                onClick={(e) => handleDeleteNote(note.filename, e)}
                className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeNote ? (
          <>
            <div className="flex flex-col border-b border-border flex-shrink-0">
              <div className="h-14 flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                  <input 
                    type="text" 
                    value={activeNote.filename.replace('.md', '')}
                    onChange={(e) => {
                      setActiveNote({ ...activeNote, filename: e.target.value });
                    }}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== '') {
                        handleRenameNote(e.target.value.trim());
                      } else {
                        // Revert if empty
                        const originalNote = notes.find(n => n.filename === activeNote.filename);
                        if (originalNote) {
                          setActiveNote(originalNote);
                        }
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className="bg-transparent font-medium focus:outline-none focus:ring-1 focus:ring-ring rounded px-1"
                  />
                  {isSyncing && <span className="text-xs text-muted-foreground flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> 保存中...</span>}
                  {!isSyncing && activeNote.isDirty && <span className="text-xs text-muted-foreground">未保存的更改</span>}
                  {!isSyncing && !activeNote.isDirty && <span className="text-xs text-muted-foreground flex items-center gap-1"><Check className="w-3 h-3" /> 已保存</span>}
                </div>
                
                <div className="flex bg-muted p-1 rounded-lg">
                  <button 
                    onClick={() => setEditMode('edit')}
                    className={cn("px-3 py-1 text-sm rounded-md transition-colors", editMode === 'edit' ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    编辑
                  </button>
                  <button 
                    onClick={() => setEditMode('preview')}
                    className={cn("px-3 py-1 text-sm rounded-md transition-colors", editMode === 'preview' ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    预览
                  </button>
                </div>
              </div>
              
              {/* Toolbar */}
              {editMode !== 'preview' && (
                <div className="h-10 flex items-center gap-1 px-4 border-t border-border bg-muted/10 overflow-x-auto">
                  <button onClick={() => insertMarkdown('**', '**')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="加粗"><Bold className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('*', '*')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="斜体"><Italic className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('~~', '~~')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="删除线"><Strikethrough className="w-4 h-4" /></button>
                  <div className="w-px h-4 bg-border mx-1" />
                  <button onClick={() => insertMarkdown('# ')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="标题"><Heading className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('- ')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="无序列表"><List className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('1. ')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="有序列表"><ListOrdered className="w-4 h-4" /></button>
                  <div className="w-px h-4 bg-border mx-1" />
                  <button onClick={() => insertMarkdown('[', '](url)')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="链接"><LinkIcon className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('![alt](', ')')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="图片"><ImageIcon className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('`', '`')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="代码"><Code className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('==', '==')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="高亮"><Highlighter className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('> ')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="引用"><Quote className="w-4 h-4" /></button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-hidden flex relative">
              {editMode === 'edit' && (
                <div className="h-full w-full relative overflow-y-auto">
                  <LivePreviewEditor
                    editorRef={editorRef}
                    value={activeNote.content}
                    onChange={handleContentChange}
                    liveMode={true}
                    theme={isDarkMode ? 'dark' : 'light'}
                  />
                </div>
              )}
              {editMode === 'preview' && (
                <div className="h-full w-full overflow-y-auto p-8 bg-background relative">
                  <div className="max-w-3xl mx-auto markdown-body">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkBreaks, remarkHighlight]}
                      components={{
                        mark: ({node, ...props}) => <mark className="bg-red-200 dark:bg-red-500/30 text-inherit rounded px-0.5" {...props} />
                      }}
                    >
                      {activeNote.content}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-4">
            <FileText className="w-12 h-12 opacity-20" />
            <p>选择一个笔记或新建一个</p>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground w-full max-w-md rounded-xl shadow-lg border border-border overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-semibold text-lg">WebDAV 配置</h2>
              {config.url && (
                <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-muted rounded-md">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            
            <form 
              className="p-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                let dir = formData.get('directory') as string || '/notes';
                if (!dir.startsWith('/')) {
                  dir = '/' + dir;
                }
                saveConfig({
                  url: formData.get('url') as string,
                  username: formData.get('username') as string,
                  password: formData.get('password') as string,
                  directory: dir,
                  rememberPassword: formData.get('rememberPassword') === 'on',
                  useProxy: formData.get('useProxy') === 'on',
                });
              }}
            >
              <div className="bg-blue-500/10 text-blue-600 dark:text-blue-400 p-3 rounded-md text-sm border border-blue-500/20 space-y-2">
                <p><strong>💡 WebDAV 连接提示：</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Infini-Cloud (TeraCLOUD)</strong>：地址通常为 <code>https://[您的服务器].teracloud.jp/dav/</code>，并且必须在“My Page”中开启“Apps Connection”并使用生成的 <strong>Apps Password (应用密码)</strong>，而不是您的登录密码。</li>
                  <li><strong>坚果云</strong>：地址为 <code>https://dav.jianguoyun.com/dav/</code>，需要使用在安全设置中生成的<strong>第三方应用密码</strong>。</li>
                  <li>请确保您的 WebDAV 服务器地址填写的是 <strong>WebDAV 专属链接</strong>，而不是网页版主页链接。</li>
                </ul>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">服务器地址</label>
                <input 
                  name="url" 
                  defaultValue={config.url} 
                  placeholder="https://webdav.example.com" 
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">用户名</label>
                  <input 
                    name="username" 
                    defaultValue={config.username} 
                    className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">密码</label>
                  <input 
                    name="password" 
                    type="password"
                    defaultValue={config.password} 
                    className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">目录路径</label>
                <input 
                  name="directory" 
                  defaultValue={config.directory} 
                  placeholder="/notes" 
                  className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground">笔记存储的文件夹路径。</p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="rememberPassword" 
                  name="rememberPassword" 
                  defaultChecked={config.rememberPassword ?? true} 
                  className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                />
                <label htmlFor="rememberPassword" className="text-sm font-medium cursor-pointer">记住密码</label>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="useProxy" 
                  name="useProxy" 
                  defaultChecked={config.useProxy ?? true} 
                  className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                />
                <label htmlFor="useProxy" className="text-sm font-medium cursor-pointer">使用代理 (解决 CORS 跨域问题)</label>
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                  className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isTestingConnection ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                  测试连接
                </button>
                {config.url && (
                  <button 
                    type="button" 
                    onClick={() => setShowSettings(false)}
                    className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-md transition-colors"
                  >
                    取消
                  </button>
                )}
                <button 
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  保存并连接
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
