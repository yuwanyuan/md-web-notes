import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, Save, RefreshCw, Plus, FileText, Trash2, X, Check,
  Bold, Italic, Strikethrough, Heading, List, ListOrdered, Link as LinkIcon, Image as ImageIcon, Code, Quote,
  Moon, Sun, Highlighter, Menu, Github, Languages, ChevronDown, ChevronUp
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
import prism from 'react-syntax-highlighter/dist/esm/styles/prism/prism';
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
        let i = 0;
        while (i < node.children.length) {
          const child = node.children[i];
          if (child.type === 'text') {
            const regex = /==(.+?)==/g;
            let lastIndex = 0;
            let match;
            const newNodes: any[] = [];

            while ((match = regex.exec(child.value)) !== null) {
              if (match.index > lastIndex) {
                newNodes.push({ type: 'text', value: child.value.slice(lastIndex, match.index) });
              }
              newNodes.push({
                type: 'emphasis',
                data: { hName: 'mark' },
                children: [{ type: 'text', value: match[1] }]
              });
              lastIndex = regex.lastIndex;
            }

            if (newNodes.length > 0) {
              if (lastIndex < child.value.length) {
                newNodes.push({ type: 'text', value: child.value.slice(lastIndex) });
              }
              node.children.splice(i, 1, ...newNodes);
              i += newNodes.length;
              continue;
            }
          } else {
            visit(child);
          }
          i++;
        }
      }
    };
    visit(tree);
  };
};

// --- Translations ---
const translations = {
  zh: {
    appName: 'md速记',
    newNote: '新建笔记',
    syncNotes: '同步笔记',
    settings: '设置',
    lightMode: '切换到浅色模式',
    darkMode: '切换到深色模式',
    noNotes: '未找到笔记。请新建一个或检查 WebDAV 设置。',
    deleteConfirm: '确定要删除此笔记吗？',
    delete: '删除',
    cancel: '取消',
    renameSuccess: '重命名成功',
    renameError: '重命名失败',
    fileExist: '文件名已存在',
    saveSuccess: '已保存',
    saving: '保存中...',
    unsaved: '未保存的更改',
    edit: '编辑',
    preview: '预览',
    bold: '加粗',
    italic: '斜体',
    strikethrough: '删除线',
    heading: '标题',
    list: '无序列表',
    orderedList: '有序列表',
    link: '链接',
    image: '图片',
    code: '代码',
    highlight: '高亮',
    quote: '引用',
    selectNote: '选择一个笔记或新建一个',
    webdavConfig: 'WebDAV 配置',
    serverUrl: '服务器地址',
    username: '用户名',
    password: '密码',
    directory: '目录路径',
    directoryHint: '笔记存储的文件夹路径。',
    rememberPassword: '记住密码',
    useProxy: '使用代理 (解决 CORS 跨域问题)',
    testConnection: '测试连接',
    saveAndConnect: '保存并连接',
    testSuccess: '连接测试成功！',
    testError: '连接测试失败',
    syncSuccess: '笔记同步成功',
    syncError: '同步失败',
    loadError: '加载笔记内容失败',
    autoSaveError: '自动保存笔记失败',
    about: '关于',
    githubRepo: '文件仓库',
    language: '语言',
    switchLanguage: '切换语言',
    webdavTips: 'WebDAV 连接提示：',
    webdavTip1: 'Infini-Cloud：地址通常为 https://[您的服务器].infinitas-jp.com/dav/ 或 https://[您的服务器].teracloud.jp/dav/。必须在“My Page”中开启“Apps Connection”并使用生成的应用密码。',
    webdavTip2: '坚果云：地址为 https://dav.jianguoyun.com/dav/，必须使用在安全设置中生成的第三方应用密码。',
    webdavTip3: '提示：如果遇到 403 错误，请检查用户名/密码（应用密码）是否正确，以及 URL 是否包含 /dav/ 后缀。',
    loading: '加载中',
    openLatestNote: '打开网页默认打开最新的一个笔记',
    generalSettings: '通用设置',
    dataLossWarning: '为避免您的数据丢失请先配置 WebDAV 存储，所有数据本地保存，我们无法读取您的信息'
  },
  en: {
    appName: 'mdQuick',
    newNote: 'New Note',
    syncNotes: 'Sync Notes',
    settings: 'Settings',
    lightMode: 'Switch to Light Mode',
    darkMode: 'Switch to Dark Mode',
    noNotes: 'No notes found. Create one or check WebDAV settings.',
    deleteConfirm: 'Are you sure you want to delete this note?',
    delete: 'Delete',
    cancel: 'Cancel',
    renameSuccess: 'Rename successful',
    renameError: 'Rename failed',
    fileExist: 'Filename already exists',
    saveSuccess: 'Saved',
    saving: 'Saving...',
    unsaved: 'Unsaved changes',
    edit: 'Edit',
    preview: 'Preview',
    bold: 'Bold',
    italic: 'Italic',
    strikethrough: 'Strikethrough',
    heading: 'Heading',
    list: 'Bullet List',
    orderedList: 'Ordered List',
    link: 'Link',
    image: 'Image',
    code: 'Code',
    highlight: 'Highlight',
    quote: 'Quote',
    selectNote: 'Select a note or create a new one',
    webdavConfig: 'WebDAV Configuration',
    serverUrl: 'Server URL',
    username: 'Username',
    password: 'Password',
    directory: 'Directory Path',
    directoryHint: 'Folder path where notes are stored.',
    rememberPassword: 'Remember Password',
    useProxy: 'Use Proxy (Fix CORS issues)',
    testConnection: 'Test Connection',
    saveAndConnect: 'Save & Connect',
    testSuccess: 'Connection test successful!',
    testError: 'Connection test failed',
    syncSuccess: 'Notes synced successfully',
    syncError: 'Sync failed',
    loadError: 'Failed to load note content',
    autoSaveError: 'Failed to auto-save note',
    about: 'About',
    githubRepo: 'GitHub Repository',
    language: 'Language',
    switchLanguage: 'Switch Language',
    webdavTips: 'WebDAV Connection Tips:',
    webdavTip1: 'Infini-Cloud: The address is usually https://[server].infinitas-jp.com/dav/ or https://[server].teracloud.jp/dav/. You must enable "Apps Connection" in "My Page" and use the generated Apps Password.',
    webdavTip2: 'Jianguoyun: The address is https://dav.jianguoyun.com/dav/. Use the third-party app password generated in security settings.',
    webdavTip3: 'Tip: If you get a 403 error, check your credentials (app password) and ensure the URL includes the /dav/ suffix.',
    loading: 'Loading',
    openLatestNote: 'Open the latest note by default',
    generalSettings: 'General Settings',
    dataLossWarning: 'To avoid data loss, please configure WebDAV storage first. All data is saved locally, and we cannot read your information.'
  }
};

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen p-4 text-center bg-background text-foreground">
          <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
          <pre className="p-4 bg-muted rounded-md overflow-auto max-w-full text-left text-xs mb-4">
            {this.state.error?.message}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Main App Component ---
export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [language, setLanguage] = useState<'zh' | 'en'>(() => {
    return (localStorage.getItem('language') as 'zh' | 'en') || 'zh';
  });
  
  const t = translations[language];

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
  
  console.log('AppContent rendering, config.url:', config.url);
  
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingFilename, setEditingFilename] = useState('');
  const [openLatestNote, setOpenLatestNote] = useState(() => {
    return localStorage.getItem('open_latest_note') === 'true';
  });
  const [isWebDAVExpanded, setIsWebDAVExpanded] = useState(false);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (activeNote) {
      setEditingFilename(activeNote.filename.replace('.md', ''));
      
      // Add a small delay when switching notes to prevent editor race conditions
      setIsTransitioning(true);
      const timer = setTimeout(() => setIsTransitioning(false), 200);
      return () => clearTimeout(timer);
    }
  }, [activeNote?.filename]);

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('open_latest_note', openLatestNote.toString());
  }, [openLatestNote]);

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
      toast.success(t.testSuccess);
    } catch (error: any) {
      console.error(error);
      toast.error(`${t.testError}: ${error.message || '请检查地址、凭据或代理设置'}`);
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
        toast.error(t.autoSaveError);
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
      const mappedNotes = remoteNotes.map(n => ({ ...n, content: '' }));
      setNotes(mappedNotes);
      toast.success(t.syncSuccess);

      // If openLatestNote is enabled and no active note, open the latest one
      if (openLatestNote && mappedNotes.length > 0 && !activeNote) {
        const latest = [...mappedNotes].sort((a, b) => 
          new Date(b.lastmod || 0).getTime() - new Date(a.lastmod || 0).getTime()
        )[0];
        handleSelectNote(latest);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(`${t.syncError}: ${error.message || '请检查 CORS 或凭据'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectNote = async (note: Note) => {
    // If clicking the already active note, just close sidebar on mobile
    if (activeNote?.filename === note.filename) {
      if (window.innerWidth < 768) setIsSidebarOpen(false);
      return;
    }

    // Close sidebar immediately on mobile for better feedback
    if (window.innerWidth < 768) setIsSidebarOpen(false);

    if (activeNote?.isDirty) {
      // Save current note in background to not block UI switch
      const oldNote = { ...activeNote };
      const path = `${config.directory.replace(/\/$/, '')}/${oldNote.filename}`;
      writeNote(path, oldNote.content).catch(e => {
        console.error('Background save failed:', e);
        toast.error('保存上一个笔记失败');
      });
      
      // Mark as not dirty locally so we don't try to save it again
      setNotes(prev => prev.map(n => n.filename === oldNote.filename ? { ...n, isDirty: false } : n));
    }

    // Capture the filename we are trying to load
    const targetFilename = note.filename;

    // Set activeNote immediately to provide instant feedback
    setActiveNote(note);

    if (!note.content && !note.isLocalOnly) {
      setIsLoading(true);
      try {
        const path = `${config.directory.replace(/\/$/, '')}/${targetFilename}`;
        const content = await readNote(path);
        
        // Use functional update to ensure we only update if the user hasn't switched notes
        setActiveNote(prev => {
          if (prev?.filename === targetFilename) {
            return { ...prev, content };
          }
          return prev;
        });
        
        // Update the notes list as well
        setNotes(prev => prev.map(n => 
          n.filename === targetFilename ? { ...n, content } : n
        ));
      } catch (error) {
        console.error(error);
        toast.error(t.loadError);
      } finally {
        // Only stop loading if we are still on the same note
        // Actually, setIsLoading(false) is fine as it's global, but it might hide loading for a DIFFERENT note
        // But since we only load one note at a time, it's mostly okay.
        setIsLoading(false);
      }
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
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleDeleteNote = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    toast(t.deleteConfirm, {
      action: {
        label: t.delete,
        onClick: async () => {
          try {
            setIsSyncing(true);
            const noteToDelete = notes.find(n => n.filename === filename);
            
            if (noteToDelete && !noteToDelete.isLocalOnly) {
              const path = `${config.directory.replace(/\/$/, '')}/${filename}`;
              await deleteNote(path);
            }
            
            setNotes(prev => prev.filter(n => n.filename !== filename));
            setActiveNote(prev => prev?.filename === filename ? null : prev);
            toast.success(t.delete + '成功');
          } catch (error) {
            console.error(error);
            toast.error(t.delete + '失败');
          } finally {
            setIsSyncing(false);
          }
        },
      },
      cancel: {
        label: t.cancel,
        onClick: () => {},
      },
    });
  };

  const handleRenameNote = async (oldFilename: string, newFilename: string) => {
    if (!activeNote || newFilename === oldFilename.replace('.md', '')) return;
    
    const newFilenameWithExt = newFilename.endsWith('.md') ? newFilename : `${newFilename}.md`;
    
    // Check if file already exists
    if (notes.some(n => n.filename === newFilenameWithExt && n.filename !== oldFilename)) {
      toast.error(t.fileExist);
      setEditingFilename(oldFilename.replace('.md', ''));
      return;
    }

    try {
      setIsSyncing(true);
      const oldPath = `${config.directory.replace(/\/$/, '')}/${oldFilename}`;
      const newPath = `${config.directory.replace(/\/$/, '')}/${newFilenameWithExt}`;
      
      if (!activeNote.isLocalOnly) {
        // If it's on the server, we need to move it
        const client = getWebDAVClient();
        if (client) {
          await client.moveFile(oldPath, newPath);
        }
      }
      
      // Update local state
      setActiveNote(prev => {
        if (prev?.filename === oldFilename) {
          return { ...prev, filename: newFilenameWithExt };
        }
        return prev;
      });
      
      setNotes(prev => prev.map(n => 
        n.filename === oldFilename ? { ...n, filename: newFilenameWithExt } : n
      ));
      
      toast.success(t.renameSuccess);
    } catch (error) {
      console.error(error);
      toast.error(t.renameError);
      setEditingFilename(oldFilename.replace('.md', ''));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleContentChange = (newContent: string, targetFilename: string) => {
    setActiveNote(prev => {
      if (!prev || prev.filename !== targetFilename) return prev;
      return { ...prev, content: newContent, isDirty: true };
    });
    
    setNotes(notesPrev => notesPrev.map(n => 
      n.filename === targetFilename ? { ...n, content: newContent, isDirty: true } : n
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
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans relative">
      <Toaster position="top-center" />
      
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-card flex flex-col flex-shrink-0 transition-transform duration-300 ease-in-out md:relative md:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h1 className="font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {t.appName}
          </h1>
          <div className="flex gap-1">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)} 
              className="p-1.5 hover:bg-muted rounded-md transition-colors"
              title={isDarkMode ? t.lightMode : t.darkMode}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button 
              onClick={fetchNotes} 
              className="p-1.5 hover:bg-muted rounded-md transition-colors"
              title={t.syncNotes}
              disabled={isLoading || !config.url}
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </button>
            <button 
              onClick={() => setShowSettings(true)} 
              className="p-1.5 hover:bg-muted rounded-md transition-colors"
              title={t.settings}
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
            {t.newNote}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {notes.length === 0 && !isLoading && (
            <div className="text-center text-sm text-muted-foreground p-4">
              {t.noNotes}
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
                title={t.delete}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {isLoading && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t.loading}...</p>
            </div>
          </div>
        )}
        {activeNote ? (
          <>
            <div className="flex flex-col border-b border-border flex-shrink-0">
              <div className="h-14 flex items-center justify-between px-4">
                <div className="flex items-center gap-2 md:gap-3 overflow-hidden">
                  <button 
                    onClick={() => setIsSidebarOpen(true)}
                    className="p-1.5 hover:bg-muted rounded-md md:hidden flex-shrink-0"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  <input 
                    type="text" 
                    value={editingFilename}
                    onChange={(e) => {
                      setEditingFilename(e.target.value);
                    }}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== '') {
                        handleRenameNote(activeNote.filename, e.target.value.trim());
                      } else {
                        // Revert if empty
                        setEditingFilename(activeNote.filename.replace('.md', ''));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className="bg-transparent font-medium focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 truncate min-w-0"
                  />
                  <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                    {isSyncing && <span className="text-xs text-muted-foreground flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> {t.saving}</span>}
                    {!isSyncing && activeNote.isDirty && <span className="text-xs text-muted-foreground">{t.unsaved}</span>}
                    {!isSyncing && !activeNote.isDirty && <span className="text-xs text-muted-foreground flex items-center gap-1"><Check className="w-3 h-3" /> {t.saveSuccess}</span>}
                  </div>
                </div>
                
                <div className="flex bg-muted p-1 rounded-lg flex-shrink-0">
                  <button 
                    onClick={() => setEditMode('edit')}
                    className={cn("px-2 md:px-3 py-1 text-sm rounded-md transition-colors", editMode === 'edit' ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {t.edit}
                  </button>
                  <button 
                    onClick={() => setEditMode('preview')}
                    className={cn("px-2 md:px-3 py-1 text-sm rounded-md transition-colors", editMode === 'preview' ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {t.preview}
                  </button>
                </div>
              </div>
              
              {/* Toolbar */}
              {editMode !== 'preview' && (
                <div className="h-10 flex items-center gap-1 px-4 border-t border-border bg-muted/10 overflow-x-auto no-scrollbar">
                  <button onClick={() => insertMarkdown('**', '**')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title={t.bold}><Bold className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('*', '*')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title={t.italic}><Italic className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('~~', '~~')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title={t.strikethrough}><Strikethrough className="w-4 h-4" /></button>
                  <div className="w-px h-4 bg-border mx-1" />
                  <button onClick={() => insertMarkdown('# ')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title={t.heading}><Heading className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('- ')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title={t.list}><List className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('1. ')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title={t.orderedList}><ListOrdered className="w-4 h-4" /></button>
                  <div className="w-px h-4 bg-border mx-1" />
                  <button onClick={() => insertMarkdown('[', '](url)')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title={t.link}><LinkIcon className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('![alt](', ')')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title={t.image}><ImageIcon className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('`', '`')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title={t.code}><Code className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('==', '==')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title={t.highlight}><Highlighter className="w-4 h-4" /></button>
                  <button onClick={() => insertMarkdown('> ')} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title={t.quote}><Quote className="w-4 h-4" /></button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-hidden flex relative">
              {editMode === 'edit' && (
                <div className="h-full w-full relative overflow-y-auto">
                  {!isTransitioning && (
                    <LivePreviewEditor
                      key={activeNote.filename}
                      editorRef={editorRef}
                      value={activeNote.content}
                      onChange={(val) => handleContentChange(val, activeNote.filename)}
                      liveMode={true}
                      theme={isDarkMode ? 'dark' : 'light'}
                    />
                  )}
                  {isTransitioning && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                      <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}
              {editMode === 'preview' && (
                <div className="h-full w-full overflow-y-auto p-4 md:p-8 bg-background relative">
                  <div className="max-w-3xl mx-auto markdown-body">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkBreaks, remarkHighlight]}
                      components={{
                        mark: ({node, ...props}) => <mark className="bg-red-200 dark:bg-red-500/30 text-inherit dark:text-slate-200 rounded px-0.5" {...props} />,
                        code({node, inline, className, children, ...props}: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          return !inline && match ? (
                            <SyntaxHighlighter
                              style={isDarkMode ? vscDarkPlus : prism}
                              language={match[1]}
                              PreTag="div"
                              customStyle={{
                                margin: 0,
                                borderRadius: '0.5rem',
                                fontSize: '0.875rem',
                                color: isDarkMode ? '#e2e8f0' : undefined,
                              }}
                              {...props}
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          ) : (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          );
                        }
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
          <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-4 p-4 text-center">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-muted rounded-md md:hidden absolute top-4 left-4"
            >
              <Menu className="w-6 h-6" />
            </button>
            <FileText className="w-12 h-12 opacity-20" />
            <p>{t.selectNote}</p>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground w-full max-w-md rounded-xl shadow-lg border border-border overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-semibold text-lg">{t.webdavConfig}</h2>
              {config.url && (
                <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-muted rounded-md">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs leading-relaxed">
              <p className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5">⚠️</span>
                {t.dataLossWarning}
              </p>
            </div>
            
            <div className="overflow-y-auto flex-1">
              <div className="p-4 border-b border-border">
                <button 
                  onClick={() => setIsWebDAVExpanded(!isWebDAVExpanded)}
                  className="flex items-center justify-between w-full text-left font-medium text-sm hover:text-primary transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
                    {t.webdavConfig}
                  </span>
                  {isWebDAVExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                
                {isWebDAVExpanded && (
                  <form 
                    className="mt-4 space-y-4"
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
                      <p><strong>💡 {t.webdavTips}</strong></p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>{t.webdavTip1}</li>
                        <li>{t.webdavTip2}</li>
                        <li>{t.webdavTip3}</li>
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t.serverUrl}</label>
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
                        <label className="text-sm font-medium">{t.username}</label>
                        <input 
                          name="username" 
                          defaultValue={config.username} 
                          className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t.password}</label>
                        <input 
                          name="password" 
                          type="password"
                          defaultValue={config.password} 
                          className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t.directory}</label>
                      <input 
                        name="directory" 
                        defaultValue={config.directory} 
                        placeholder="/notes" 
                        className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <p className="text-xs text-muted-foreground">{t.directoryHint}</p>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input 
                        type="checkbox" 
                        id="rememberPassword" 
                        name="rememberPassword" 
                        defaultChecked={config.rememberPassword ?? true} 
                        className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                      />
                      <label htmlFor="rememberPassword" className="text-sm font-medium cursor-pointer">{t.rememberPassword}</label>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input 
                        type="checkbox" 
                        id="useProxy" 
                        name="useProxy" 
                        defaultChecked={config.useProxy ?? true} 
                        className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                      />
                      <label htmlFor="useProxy" className="text-sm font-medium cursor-pointer">{t.useProxy}</label>
                    </div>

                    <div className="pt-4 flex flex-wrap gap-2">
                      <button 
                        type="button" 
                        onClick={handleTestConnection}
                        disabled={isTestingConnection}
                        className="flex-1 px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isTestingConnection ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                        {t.testConnection}
                      </button>
                      <button 
                        type="submit"
                        className="flex-1 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                      >
                        {t.saveAndConnect}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <div className="p-4 space-y-4">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    {t.generalSettings}
                  </h3>
                  
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="openLatestNote" 
                      checked={openLatestNote} 
                      onChange={(e) => setOpenLatestNote(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                    />
                    <label htmlFor="openLatestNote" className="text-sm font-medium cursor-pointer">{t.openLatestNote}</label>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Languages className="w-4 h-4" />
                    {t.language}
                  </label>
                  <div className="flex bg-muted p-1 rounded-lg">
                    <button 
                      onClick={() => setLanguage('zh')}
                      className={cn("flex-1 py-1.5 text-sm rounded-md transition-colors", language === 'zh' ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                    >
                      中文
                    </button>
                    <button 
                      onClick={() => setLanguage('en')}
                      className={cn("flex-1 py-1.5 text-sm rounded-md transition-colors", language === 'en' ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                    >
                      English
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Github className="w-4 h-4" />
                    {t.about}
                  </label>
                  <div className="bg-muted/50 p-3 rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">{t.githubRepo}</p>
                    <a 
                      href="https://github.com/yuwanyuan/md-web-notes" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-blue-500 hover:underline break-all"
                    >
                      https://github.com/yuwanyuan/md-web-notes
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
