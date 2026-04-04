import { useState } from 'react';
import {
  Settings, BookOpen, Check, RotateCcw, AlertCircle,
  GraduationCap, FileText, PenTool, School, ChevronDown,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStore } from '@/hooks/useStore';
import { isAPIAvailable, GEMINI_CONFIG, OPENAI_CONFIG, testAPIConnection } from '@/lib/api';
import type { APIType } from '@/lib/api';
import type { AppMode } from '@/types';

const modeConfig: Record<AppMode, { label: string; icon: React.ElementType; description: string }> = {
  secondary: { label: '中學命題寫作', icon: GraduationCap, description: 'HKDSE 卷二乙部' },
  primary: { label: '小學命題寫作', icon: School, description: '小學中文作文' },
  practical: { label: '實用寫作批改', icon: FileText, description: 'DSE 卷二甲部' },
  'exam-generator': { label: '模擬卷生成', icon: PenTool, description: '實用寫作試卷' },
};

export function Navigation() {
  const {
    apiKey, apiType, apiModel, apiBaseURL, appMode,
    setAppMode, setApiKey, setApiType, setApiModel, setApiBaseURL,
    resetAll, resetForNextBatch,
    currentStep, setStep,
    secondaryReports, primaryReports, practicalReports,
  } = useStore();

  const [localKey, setLocalKey] = useState(apiKey);
  const [localType, setLocalType] = useState<APIType>(apiType);
  const [localModel, setLocalModel] = useState(apiModel);
  const [localBaseURL, setLocalBaseURL] = useState(apiBaseURL);
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<{ testing: boolean; success?: boolean; message?: string }>({ testing: false });

  const currentMode = modeConfig[appMode];
  const ModeIcon = currentMode.icon;

  // 計算已累積的報告數
  const accumulatedCount =
    appMode === 'primary' ? primaryReports.length :
    appMode === 'practical' ? practicalReports.length :
    secondaryReports.length;

  const handleModeChange = (mode: AppMode) => {
    setAppMode(mode);
    setStep(0);
  };

  const handleSave = () => {
    if (!localKey || localKey.length < 10) { setApiError('請輸入有效的 API 密鑰'); return; }
    let finalModel = localModel;
    if (localType === 'gemini') finalModel = localModel || GEMINI_CONFIG.model;
    else if (localType === 'openai') finalModel = localModel || OPENAI_CONFIG.model;
    setApiKey(localKey);
    setApiType(localType);
    setApiModel(finalModel);
    setApiBaseURL(localBaseURL);
    setApiError(null);
    setShowConfirm(true);
    setTimeout(() => { setShowConfirm(false); setIsOpen(false); }, 1500);
  };

  const handleResetAll = () => {
    const { apiKey: k, apiType: t, apiModel: m, apiBaseURL: u } = { apiKey, apiType, apiModel, apiBaseURL };
    resetAll();
    setApiKey(k); setApiType(t); setApiModel(m); setApiBaseURL(u);
    setStep(0);
    window.location.reload();
  };

  const handleNextBatch = () => {
    resetForNextBatch();
    // 不reload，直接回到設定頁（step 0），報告保留
  };

  const handleTabChange = (value: string) => {
    const newType = value as APIType;
    setLocalType(newType);
    setTestStatus({ testing: false });
    if (newType === 'gemini') { setLocalModel(GEMINI_CONFIG.model); setLocalBaseURL(''); }
    else if (newType === 'openai') { setLocalModel(OPENAI_CONFIG.model); setLocalBaseURL(''); }
  };

  const handleTestConnection = async () => {
    if (!localKey || localKey.length < 10) { setApiError('請先輸入有效的 API 密鑰'); return; }
    setTestStatus({ testing: true });
    setApiError(null);
    try {
      const result = await testAPIConnection({ apiKey: localKey, apiType: localType, model: localModel, baseURL: localBaseURL });
      setTestStatus({ testing: false, success: result.success, message: result.message });
    } catch (error: any) {
      setTestStatus({ testing: false, success: false, message: error.message || '測試失敗' });
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-[#E2E8F0] z-50 shadow-sm">
      <div className="max-w-7xl mx-auto h-full px-4 flex items-center justify-between">

        {/* Logo & Mode Switcher */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#4A6FA5] rounded-lg flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold text-[#2D3748]">中文科寫作批改及擬卷</h1>
            <p className="text-xs text-[#718096]">{currentMode.description}</p>
          </div>

          {/* 模式切換（加下拉箭頭） */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ml-2 gap-2">
                <ModeIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{currentMode.label}</span>
                <ChevronDown className="w-3 h-3 text-[#718096]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>切換功能</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {([
                ['secondary', GraduationCap, '中學命題寫作', 'HKDSE 卷二乙部'],
                ['primary', School, '小學命題寫作', '小學中文作文'],
                ['practical', FileText, '實用寫作批改', 'DSE 卷二甲部'],
                ['exam-generator', PenTool, '模擬卷生成', '實用寫作試卷'],
              ] as const).map(([mode, Icon, label, desc]) => (
                <DropdownMenuItem key={mode} onClick={() => handleModeChange(mode)}>
                  <Icon className="w-4 h-4 mr-2" />
                  <div>
                    <div className="font-medium">{label}</div>
                    <div className="text-xs text-[#718096]">{desc}</div>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">

          {/* 【下一批】按鈕：有已批改報告且在step 0時才顯示 */}
          {accumulatedCount > 0 && currentStep === 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 text-[#4A6FA5] border-[#4A6FA5]">
                  <Layers className="w-4 h-4" />
                  <span className="hidden sm:inline">下一批上傳</span>
                  <span className="text-xs bg-[#4A6FA5] text-white rounded-full px-1.5 py-0.5">
                    {accumulatedCount}篇
                  </span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>上傳下一批作文</AlertDialogTitle>
                  <AlertDialogDescription>
                    已批改 <strong>{accumulatedCount} 篇</strong>報告將會保留，清空學生作品列表後可上傳下一批繼續批改，累積至全班完成後再查看全班報告。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={handleNextBatch} className="bg-[#4A6FA5] hover:bg-[#3a5f95]">
                    清空並上傳下一批
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* 【重新設定】：全部清空 */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline" size="sm"
                className="gap-2 text-[#718096]"
                disabled={currentStep === 0 && accumulatedCount === 0 && appMode !== 'exam-generator'}
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">重新設定</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>確定要全部重新設定嗎？</AlertDialogTitle>
                <AlertDialogDescription>
                  這將清除<strong>所有</strong>已上傳的文件、學生作品和批改報告（包括已累積的 {accumulatedCount} 篇），無法恢復。
                  {accumulatedCount > 0 && (
                    <span className="block mt-2 text-[#4A6FA5]">
                      提示：若只想上傳下一批，請使用「下一批上傳」按鈕，報告不會被清除。
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetAll} className="bg-red-500 hover:bg-red-600">
                  確定全部清除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* API 設定 */}
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsOpen(true)}>
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">API 設定</span>
              {isAPIAvailable(apiKey)
                ? <Check className="w-4 h-4 text-green-500" />
                : <AlertCircle className="w-4 h-4 text-yellow-500" />
              }
            </Button>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>API 設定</DialogTitle>
                <DialogDescription>設定您的 AI API 以啟用 OCR 文字提取和自動批改功能。</DialogDescription>
              </DialogHeader>
              <Tabs value={localType} onValueChange={handleTabChange} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="openai">OpenAI</TabsTrigger>
                  <TabsTrigger value="gemini">Gemini</TabsTrigger>
                  <TabsTrigger value="custom">自定義</TabsTrigger>
                </TabsList>
                <TabsContent value="openai" className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>OpenAI API 密鑰</Label>
                    <Input type="password" placeholder="sk-..." value={localKey} onChange={(e) => { setLocalKey(e.target.value); setApiError(null); }} />
                    <p className="text-xs text-[#718096]">從 OpenAI 控制台獲取，以 sk- 開頭</p>
                  </div>
                  <div className="space-y-2">
                    <Label>模型</Label>
                    <Input placeholder="gpt-4o" value={localModel} onChange={(e) => setLocalModel(e.target.value)} />
                    <p className="text-xs text-[#718096]">gpt-4o：準確度高，適合重要評核 ／ gpt-4o-mini：較快較便宜，適合批量批改</p>
                  </div>
                </TabsContent>
                <TabsContent value="gemini" className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Google Gemini API 密鑰</Label>
                    <Input type="password" placeholder="AIzaSy..." value={localKey} onChange={(e) => { setLocalKey(e.target.value); setApiError(null); }} />
                    <p className="text-xs text-[#718096]">從 Google AI Studio 獲取，以 AIzaSy 開頭</p>
                  </div>
                  <div className="space-y-2">
                    <Label>模型</Label>
                    <Input placeholder="gemini-2.0-flash" value={localModel} onChange={(e) => setLocalModel(e.target.value)} />
                    <p className="text-xs text-[#718096]">gemini-2.0-flash：快速便宜，適合批量批改 ／ gemini-1.5-pro-latest：較準確，適合重要評核</p>
                  </div>
                </TabsContent>
                <TabsContent value="custom" className="space-y-4 py-4">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-700"><strong>自定義 API：</strong>支持任何兼容 OpenAI 格式的服務，如 DeepSeek、Azure OpenAI 等。</p>
                  </div>
                  <div className="space-y-2">
                    <Label>API 基礎 URL</Label>
                    <Input placeholder="https://api.deepseek.com/v1" value={localBaseURL} onChange={(e) => setLocalBaseURL(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>API 密鑰</Label>
                    <Input type="password" placeholder="your-api-key" value={localKey} onChange={(e) => { setLocalKey(e.target.value); setApiError(null); }} />
                  </div>
                  <div className="space-y-2">
                    <Label>模型名稱</Label>
                    <Input placeholder="deepseek-chat" value={localModel} onChange={(e) => setLocalModel(e.target.value)} />
                    <p className="text-xs text-[#718096]">deepseek-chat：快速便宜，批量批改首選</p>
                  </div>
                </TabsContent>
              </Tabs>

              {apiError && <div className="p-3 bg-red-50 rounded-lg"><p className="text-xs text-red-700">{apiError}</p></div>}
              {testStatus.message && !testStatus.testing && (
                <div className={`p-3 rounded-lg ${testStatus.success ? 'bg-green-50' : 'bg-orange-50'}`}>
                  <div className="flex items-start gap-2">
                    {testStatus.success
                      ? <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      : <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                    }
                    <p className={`text-xs ${testStatus.success ? 'text-green-700' : 'text-orange-700'}`}>{testStatus.message}</p>
                  </div>
                </div>
              )}
              {showConfirm && (
                <div className="p-3 bg-green-50 rounded-lg flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <p className="text-xs text-green-700">API 設定已保存！</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsOpen(false)}>取消</Button>
                <Button variant="secondary" onClick={handleTestConnection} disabled={testStatus.testing || !localKey}>
                  {testStatus.testing ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />測試中...</> : '測試連接'}
                </Button>
                <Button onClick={handleSave}>確定保存</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </nav>
  );
}
