import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StudentWork, SecondaryReport, PrimaryReport, PracticalReport, Question, FileInfo, SecondaryGrading, PrimaryGrading, PracticalGrading, AppMode, GeneratedExam } from '@/types';
import type { APIType, PracticalDevItems } from '@/lib/api';

export interface ExtendedFileInfo extends FileInfo { file?: File; }

interface AppState {
  appMode: AppMode;
  currentStep: number;
  selectedQuestion: Question | null;
  customQuestion: string;
  useCustomQuestion: boolean;
  autoGrade: boolean;
  ignoreRedInk: boolean;
  contentPriority: boolean;
  enhancementDirection: 'auto' | 'narrative' | 'argumentative' | 'descriptive';
  customCriteria: string;
  customCriteriaFiles: ExtendedFileInfo[];
  practicalGenre: string;
  practicalInfoPoints: string[];
  practicalDevItems: PracticalDevItems;
  practicalFormatRequirements: string[];
  practicalCriteriaConfirmed: boolean;
  practicalMaterials: string;
  studentWorks: StudentWork[];
  currentWorkIndex: number;
  uploadedFiles: ExtendedFileInfo[];
  secondaryReports: SecondaryReport[];
  primaryReports: PrimaryReport[];
  practicalReports: PracticalReport[];
  generatedExam: GeneratedExam | null;
  skippedWorks: StudentWork[];
  apiKey: string;
  apiType: APIType;
  apiModel: string;
  apiBaseURL: string;

  setAppMode: (mode: AppMode) => void;
  setStep: (step: number) => void;
  setSelectedQuestion: (question: Question | null) => void;
  setCustomQuestion: (question: string) => void;
  setUseCustomQuestion: (use: boolean) => void;
  setAutoGrade: (auto: boolean) => void;
  setIgnoreRedInk: (ignore: boolean) => void;
  setContentPriority: (priority: boolean) => void;
  setEnhancementDirection: (direction: 'auto' | 'narrative' | 'argumentative') => void;
  setPracticalGenre: (genre: string) => void;
  setPracticalInfoPoints: (points: string[]) => void;
  setPracticalDevItems: (items: PracticalDevItems) => void;
  setPracticalFormatRequirements: (reqs: string[]) => void;
  setPracticalCriteriaConfirmed: (confirmed: boolean) => void;
  setPracticalMaterials: (materials: string) => void;
  resetPracticalCriteria: () => void;
  setCustomCriteria: (criteria: string) => void;
  addCustomCriteriaFile: (file: ExtendedFileInfo) => void;
  removeCustomCriteriaFile: (id: string) => void;
  addStudentWork: (work: StudentWork) => void;
  removeStudentWork: (id: string) => void;
  updateStudentWork: (id: string, updates: Partial<StudentWork>) => void;
  setCurrentWorkIndex: (index: number) => void;
  addUploadedFile: (file: ExtendedFileInfo) => void;
  removeUploadedFile: (id: string) => void;
  clearUploadedFiles: () => void;
  clearCustomCriteriaFiles: () => void;
  addSecondaryReport: (report: SecondaryReport) => void;
  addPrimaryReport: (report: PrimaryReport) => void;
  addPracticalReport: (report: PracticalReport) => void;
  updateSecondaryReportGrading: (id: string, grading: SecondaryGrading) => void;
  updatePrimaryReportGrading: (id: string, grading: PrimaryGrading) => void;
  updatePracticalReportGrading: (id: string, grading: PracticalGrading) => void;
  setGeneratedExam: (exam: GeneratedExam | null) => void;
  setApiKey: (key: string) => void;
  setApiType: (type: APIType) => void;
  setApiModel: (model: string) => void;
  setApiBaseURL: (url: string) => void;
  resetAll: () => void;
  // 【新增】下一批：清空學生作品和上傳文件，但保留報告累積
  resetForNextBatch: () => void;
  resetReports: () => void;
  resetStudentWorks: () => void;
  addSkippedWork: (work: StudentWork) => void;
  removeSkippedWork: (id: string) => void;
  clearSkippedWorks: () => void;
  getCurrentReports: () => SecondaryReport[] | PrimaryReport[] | PracticalReport[];
}

const initialState = {
  appMode: 'secondary' as AppMode,
  currentStep: 0,
  selectedQuestion: null,
  customQuestion: '',
  useCustomQuestion: false,
  autoGrade: false,
  ignoreRedInk: false,
  contentPriority: false,
  enhancementDirection: 'auto' as 'auto' | 'narrative' | 'argumentative',
  practicalGenre: 'speech',
  practicalInfoPoints: [],
  practicalDevItems: {},
  practicalFormatRequirements: [],
  practicalCriteriaConfirmed: false,
  practicalMaterials: '',
  customCriteria: '',
  customCriteriaFiles: [],
  studentWorks: [],
  currentWorkIndex: 0,
  uploadedFiles: [],
  secondaryReports: [],
  primaryReports: [],
  practicalReports: [],
  generatedExam: null,
  skippedWorks: [],
  apiKey: '',
  apiType: 'openai' as APIType,
  apiModel: 'gpt-4o',
  apiBaseURL: '',
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setAppMode: (mode) => set((state) => ({
        appMode: mode,
        currentStep: 0,
        studentWorks: [],
        currentWorkIndex: 0,
        secondaryReports: [],
        primaryReports: [],
        practicalReports: [],
        skippedWorks: [],
        uploadedFiles: [],
        customCriteriaFiles: [],
        // 切換到模擬卷生成時保留 customQuestion 和 practicalMaterials（供預填使用）
        customQuestion: mode === 'exam-generator' ? state.customQuestion : '',
        practicalInfoPoints: [],
        practicalDevItems: {},
        practicalFormatRequirements: [],
        practicalCriteriaConfirmed: false,
        practicalMaterials: mode === 'exam-generator' ? state.practicalMaterials : '',
      })),

      setStep: (step) => set({ currentStep: step }),
      setSelectedQuestion: (question) => set({ selectedQuestion: question }),
      setCustomQuestion: (question) => set({ customQuestion: question }),
      setUseCustomQuestion: (use) => set({ useCustomQuestion: use }),
      setAutoGrade: (auto) => set({ autoGrade: auto }),
      setIgnoreRedInk: (ignore) => set({ ignoreRedInk: ignore }),
      setContentPriority: (priority) => set({ contentPriority: priority }),
      setEnhancementDirection: (direction) => set({ enhancementDirection: direction }),
      setPracticalGenre: (genre) => set({ practicalGenre: genre }),
      setPracticalInfoPoints: (points) => set({ practicalInfoPoints: points }),
      setPracticalDevItems: (items) => set({ practicalDevItems: items }),
      setPracticalFormatRequirements: (reqs) => set({ practicalFormatRequirements: reqs }),
      setPracticalCriteriaConfirmed: (confirmed) => set({ practicalCriteriaConfirmed: confirmed }),
      setPracticalMaterials: (materials) => set({ practicalMaterials: materials }),
      resetPracticalCriteria: () => set({
        practicalInfoPoints: [],
        practicalDevItems: {},
        practicalFormatRequirements: [],
        practicalCriteriaConfirmed: false,
        practicalMaterials: '',
      }),
      setCustomCriteria: (criteria) => set({ customCriteria: criteria }),
      addCustomCriteriaFile: (file) => set((state) => ({ customCriteriaFiles: [...state.customCriteriaFiles, file] })),
      removeCustomCriteriaFile: (id) => set((state) => ({ customCriteriaFiles: state.customCriteriaFiles.filter(f => f.id !== id) })),
      clearCustomCriteriaFiles: () => set({ customCriteriaFiles: [] }),
      addStudentWork: (work) => set((state) => ({ studentWorks: [...state.studentWorks, work] })),
      removeStudentWork: (id) => set((state) => ({ studentWorks: state.studentWorks.filter(w => w.id !== id) })),
      updateStudentWork: (id, updates) => set((state) => ({
        studentWorks: state.studentWorks.map(w => w.id === id ? { ...w, ...updates } : w)
      })),
      setCurrentWorkIndex: (index) => set({ currentWorkIndex: index }),
      addUploadedFile: (file) => set((state) => ({ uploadedFiles: [...state.uploadedFiles, file] })),
      removeUploadedFile: (id) => set((state) => ({ uploadedFiles: state.uploadedFiles.filter(f => f.id !== id) })),
      clearUploadedFiles: () => set({ uploadedFiles: [] }),

      // addSecondaryReport：去重（同一學生ID只保留最新報告）
      addSecondaryReport: (report) => set((state) => ({
        secondaryReports: [
          ...state.secondaryReports.filter(r => r.studentWork.id !== report.studentWork.id),
          report,
        ],
      })),
      addPrimaryReport: (report) => set((state) => ({
        primaryReports: [
          ...state.primaryReports.filter(r => r.studentWork.id !== report.studentWork.id),
          report,
        ],
      })),
      addPracticalReport: (report) => set((state) => ({
        practicalReports: [
          ...state.practicalReports.filter(r => r.studentWork.id !== report.studentWork.id),
          report,
        ],
      })),

      updateSecondaryReportGrading: (id, grading) => set((state) => ({
        secondaryReports: state.secondaryReports.map(r => {
          if (r.studentWork.id === id) {
            const totalScore = (grading.content * 4) + (grading.expression * 3) + (grading.structure * 2) + grading.punctuation;
            return { ...r, grading, totalScore, gradeLabel: getSecondaryGradeLabel(totalScore) };
          }
          return r;
        })
      })),
      updatePrimaryReportGrading: (id, grading) => set((state) => ({
        primaryReports: state.primaryReports.map(r => {
          if (r.studentWork.id === id) {
            const scoreTable = { content: [0,9,18,24,30], feeling: [0,6,12,16,20], structure: [0,6,12,16,20], language: [0,6,12,16,20], format: [0,3,6,8,10] };
            const totalScore = scoreTable.content[grading.content] + scoreTable.feeling[grading.feeling] + scoreTable.structure[grading.structure] + scoreTable.language[grading.language] + scoreTable.format[grading.format];
            return { ...r, grading, totalScore, gradeLevel: getPrimaryGradeLabel(totalScore) };
          }
          return r;
        })
      })),
      updatePracticalReportGrading: (id, grading) => set((state) => ({
        practicalReports: state.practicalReports.map(r => {
          if (r.studentWork.id === id) {
            const contentScore = (grading.info + grading.development) * 3;
            const organizationScore = grading.tone + grading.organization;
            const totalScore = contentScore + organizationScore;
            return { ...r, grading, contentScore, organizationScore, totalScore, gradeLabel: getPracticalGradeLabel(totalScore) };
          }
          return r;
        })
      })),

      setGeneratedExam: (exam) => set({ generatedExam: exam }),
      setApiKey: (key) => set({ apiKey: key }),
      setApiType: (type) => set({ apiType: type }),
      setApiModel: (model) => set({ apiModel: model }),
      setApiBaseURL: (url) => set({ apiBaseURL: url }),

      // 全部重新開始（清空一切，包括報告）
      resetAll: () => set(initialState),

      // 【新增】下一批：只清空學生作品和待上傳文件，保留已批改的報告
      // 讓老師可以上傳下一批5份，繼續累積同班報告
      resetForNextBatch: () => set(() => ({
        studentWorks: [],
        currentWorkIndex: 0,
        uploadedFiles: [],
        customCriteriaFiles: [],
        currentStep: 0,
        skippedWorks: [],
        // 保留：secondaryReports, primaryReports, practicalReports
        // 保留：selectedQuestion, customQuestion, 所有批改設定
      })),

      resetReports: () => set({ secondaryReports: [], primaryReports: [], practicalReports: [], generatedExam: null }),
      resetStudentWorks: () => set({ studentWorks: [], currentWorkIndex: 0 }),
      addSkippedWork: (work) => set((state) => ({ skippedWorks: [...state.skippedWorks.filter(w => w.id !== work.id), work] })),
      removeSkippedWork: (id) => set((state) => {
        const work = state.skippedWorks.find(w => w.id === id);
        if (work) return { skippedWorks: state.skippedWorks.filter(w => w.id !== id), studentWorks: [...state.studentWorks, work] };
        return { skippedWorks: state.skippedWorks.filter(w => w.id !== id) };
      }),
      clearSkippedWorks: () => set({ skippedWorks: [] }),
      getCurrentReports: () => {
        const state = get();
        switch (state.appMode) {
          case 'primary': return state.primaryReports;
          case 'practical': return state.practicalReports;
          default: return state.secondaryReports;
        }
      },
    }),
    {
      name: 'chinese-grading-app-storage-v2',
      partialize: (state) => ({
        // API設定
        apiKey: state.apiKey,
        apiType: state.apiType,
        apiModel: state.apiModel,
        apiBaseURL: state.apiBaseURL,
        // 批改偏好
        autoGrade: state.autoGrade,
        ignoreRedInk: state.ignoreRedInk,
        contentPriority: state.contentPriority,
        enhancementDirection: state.enhancementDirection,
        appMode: state.appMode,
        // 實用寫作設定
        practicalGenre: state.practicalGenre,
        customQuestion: state.customQuestion,
        useCustomQuestion: state.useCustomQuestion,
        selectedQuestion: state.selectedQuestion,
        practicalMaterials: state.practicalMaterials,
        practicalInfoPoints: state.practicalInfoPoints,
        practicalDevItems: state.practicalDevItems,
        practicalCriteriaConfirmed: state.practicalCriteriaConfirmed,
        // 【新增】批改歷史持久化（讓分批上傳的報告跨頁面重載保留）
        secondaryReports: state.secondaryReports,
        primaryReports: state.primaryReports,
        practicalReports: state.practicalReports,
        // studentWorks：過濾掉 File 物件（無法序列化到 localStorage）
        studentWorks: state.studentWorks.map(w => ({ ...w })),
        currentWorkIndex: state.currentWorkIndex,
        currentStep: state.currentStep,
      }),
    }
  )
);

function getSecondaryGradeLabel(totalScore: number): string {
  if (totalScore >= 90) return '上上';
  if (totalScore >= 85) return '上中';
  if (totalScore >= 80) return '上下';
  if (totalScore >= 70) return '中上';
  if (totalScore >= 60) return '中中';
  if (totalScore >= 50) return '中下';
  if (totalScore >= 40) return '下上';
  if (totalScore >= 30) return '下中';
  if (totalScore >= 10) return '下下';
  return '極差';
}
function getPrimaryGradeLabel(totalScore: number): string {
  if (totalScore >= 85) return '優異';
  if (totalScore >= 70) return '良好';
  if (totalScore >= 50) return '一般';
  return '有待改善';
}
function getPracticalGradeLabel(totalScore: number): string {
  if (totalScore >= 45) return '5**';
  if (totalScore >= 40) return '5*';
  if (totalScore >= 35) return '5';
  if (totalScore >= 30) return '4';
  if (totalScore >= 25) return '3';
  if (totalScore >= 20) return '2';
  if (totalScore >= 15) return '1';
  return 'U';
}
