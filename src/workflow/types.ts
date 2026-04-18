import type { TEditorStateV1 } from '@indreamai/client'
import type { EXPORT_FORMAT_VALUES, EXPORT_RATIO_VALUES, FPS_VALUES } from '../tools/shared'

export const WORKFLOW_VERSION = 'v6' as const

export const WORKFLOW_ROUTE_MODE_VALUES = [
  'speech-edit',
  'product-demo',
  'explainer',
] as const
export type TWorkflowRouteMode = (typeof WORKFLOW_ROUTE_MODE_VALUES)[number]

export const WORKFLOW_GATE_VALUES = [
  'capture',
  'design',
  'script',
  'storyboard',
  'build',
  'static',
  'snapshot',
  'commit',
] as const
export type TWorkflowGate = (typeof WORKFLOW_GATE_VALUES)[number]

export const WORKFLOW_BINDING_TYPE_VALUES = ['asset', 'illustration'] as const
export type TWorkflowBindingType = (typeof WORKFLOW_BINDING_TYPE_VALUES)[number]

export type TVideoRatio = (typeof EXPORT_RATIO_VALUES)[number]
export type TExportFormat = (typeof EXPORT_FORMAT_VALUES)[number]
export type TFps = (typeof FPS_VALUES)[number]

export interface IWorkflowBrief {
  topic: string
  goal?: string
  audience?: string
  ratio?: TVideoRatio
  fps?: TFps
  durationTargetSeconds?: number
  tone?: string
  cta?: string
  transcript?: string
}

export interface IStoryboardCopy {
  headline?: string
  subheadline?: string
  description?: string
  badge?: string
  cta?: string
  caption?: string
}

export interface IAssetBindingRef {
  slotKey: string
  binding: TWorkflowBinding
}

export type TWorkflowBinding =
  | { type: 'asset'; assetId: string }
  | { type: 'illustration'; illustrationName: string }

export interface ITransitionSpec {
  type: string
  durationMs?: number
}

export interface IStoryboardScene {
  sceneId: string
  durationMs: number
  intent: string
  blockRef: string
  blockOverride?: Record<string, unknown>
  slots: Record<string, TWorkflowBinding>
  copy: IStoryboardCopy
  transitionOut?: ITransitionSpec | null
  customSparse?: ISparseSceneFragment
}

export interface IStoryboardV6 {
  version: typeof WORKFLOW_VERSION
  routeMode: TWorkflowRouteMode
  output: {
    ratio: TVideoRatio
    fps: TFps
    durationTargetSeconds?: number
    format: TExportFormat
    scale: number
  }
  designRefPath?: string
  scriptRefPath?: string
  scenes: IStoryboardScene[]
  globalStyle: {
    theme: string
    accentColor: string
    backgroundColor: string
  }
  reviewContracts: {
    enforceTrackOverlapFree: boolean
    enforceSceneDurationMatch: boolean
    enforceCtaSingleLine: boolean
  }
}

export type IKeyframeShortcut =
  | number
  | number[]
  | { from: number; to: number }
  | { value: number; keyframes: Array<{ t: number; v: number }> }

export interface ISparseTextSpec {
  content: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number | string
  color?: string
  lineHeight?: number
  align?: 'left' | 'center' | 'right'
}

export interface ISparseAssetCrop {
  mode?: 'fit' | 'fill' | 'crop-top' | 'crop-bottom' | 'crop-left' | 'crop-right' | 'crop-center'
  left?: number
  top?: number
  right?: number
  bottom?: number
}

export type ISparseClip =
  | { $ref: string; override?: Record<string, unknown> }
  | ISparseClipInline

export interface ISparseClipInline {
  id: string
  type: 'text' | 'image' | 'video' | 'gif' | 'audio' | 'caption' | 'lottie' | 'solid' | 'illustration'
  startMs: number
  durationMs: number
  opacity?: IKeyframeShortcut
  scale?: IKeyframeShortcut
  rotation?: IKeyframeShortcut
  position?: { x?: number | IKeyframeShortcut; y?: number | IKeyframeShortcut }
  size?: { width?: number; height?: number }
  zIndex?: number
  asset?: TWorkflowBinding | { slotKey: string }
  crop?: ISparseAssetCrop
  text?: ISparseTextSpec
  color?: string
  borderRadius?: number
  illustrationName?: string
  illustrationColor?: string
  effects?: Array<{ type: string; params?: Record<string, unknown> }>
  filters?: Array<{ type: string; params?: Record<string, unknown> }>
  animation?: { in?: string; out?: string; loop?: string }
  transitionIn?: ITransitionSpec | null
  transitionOut?: ITransitionSpec | null
}

export interface ISparseSceneFragment {
  sceneId: string
  tracks: Record<string, ISparseClip[]>
}

export const WORKFLOW_REVIEW_FOCUS_VALUES = [
  'all',
  'script',
  'layout',
  'assets',
  'animation',
] as const
export type TWorkflowReviewFocus = (typeof WORKFLOW_REVIEW_FOCUS_VALUES)[number]

export interface IWorkflowReviewDiagnostic {
  severity: 'error' | 'warning'
  code: string
  path: string
  sceneId?: string
  message: string
  fixStrategy?: string
  suggestedOps?: TWorkflowSemanticOp[]
}

export interface IWorkflowReviewSummary {
  status: 'ok' | 'failed'
  blockingCount: number
  warningCount: number
  diagnostics: IWorkflowReviewDiagnostic[]
  appliedRepairs: string[]
}

export interface IGateStatus {
  gate: TWorkflowGate
  passed: boolean
  updatedAt: string | null
  artifactPath: string | null
  notes?: string
}

export interface IWorkflowArtifactSummary {
  routeMode: TWorkflowRouteMode
  gate: TWorkflowGate
  gateStatuses: IGateStatus[]
  sceneCount: number
  totalDurationMs: number
  submittedScenes: string[]
  unresolvedRequiredBindings: string[]
  scenes: Array<{
    sceneId: string
    intent: string
    blockRef: string
    durationMs: number
    slotsFilled: string[]
    copyKeys: string[]
  }>
}

export interface IWorkflowCheckpointSnapshot {
  gate: TWorkflowGate
  createdAt: string
  summary: IWorkflowArtifactSummary
  review: Pick<IWorkflowReviewSummary, 'status' | 'blockingCount' | 'warningCount'>
  storyboardHash: string
}

export interface IWorkflowArtifact {
  artifactId: string
  kind: 'workflow'
  routeMode: TWorkflowRouteMode
  brief: IWorkflowBrief
  storyboard: IStoryboardV6
  currentGate: TWorkflowGate
  gateStatuses: IGateStatus[]
  submittedSceneIds: string[]
  latestReview: IWorkflowReviewSummary
  checkpoints: IWorkflowCheckpointSnapshot[]
  summary: IWorkflowArtifactSummary
  artifactDir: string
  createdAt: string
  updatedAt: string
}

export interface ICompiledWorkflowArtifact {
  artifactId: string
  kind: 'compiled-workflow'
  workflowArtifactId: string
  editorState: TEditorStateV1
  editorStateHash: string
  reviewSnapshot: IWorkflowReviewSummary
  createdAt: string
  updatedAt: string
}

export interface IWorkflowProjectBindingRecord {
  projectId: string
  workflowArtifactId: string
  compiledArtifactId: string
  updatedAt: string
}

export type TWorkflowSemanticOp =
  // Gate / phase
  | { type: 'advance-gate'; gate: TWorkflowGate; notes?: string }
  | { type: 'set-design'; content: string }
  | { type: 'set-script'; content: string }
  | { type: 'set-storyboard'; storyboard: Partial<IStoryboardV6> }
  // Brief / scene metadata
  | { type: 'replace-brief-fields'; patch: Partial<IWorkflowBrief> }
  | { type: 'rewrite-scene-copy'; sceneId: string; copy: Partial<IStoryboardCopy> }
  | { type: 'retime-scene'; sceneId: string; durationMs: number }
  | { type: 'reorder-scenes'; sceneIds: string[] }
  | { type: 'split-scene'; sceneId: string; nextSceneId: string; splitDurationMs: number; copyPatch?: Partial<IStoryboardCopy> }
  | { type: 'merge-scenes'; sceneIds: [string, string]; nextSceneId: string }
  // Block-level
  | { type: 'set-scene-block'; sceneId: string; blockRef: string }
  | { type: 'set-scene-block-override'; sceneId: string; override: Record<string, unknown> }
  // Bindings
  | { type: 'bind-asset'; sceneId?: string; slotKey: string; binding: TWorkflowBinding }
  | { type: 'set-transition'; sceneId: string; transition: ITransitionSpec | null }
  // Geometry / visual
  | { type: 'set-clip-geometry'; sceneId: string; clipId: string; position?: { x?: number; y?: number }; scale?: number; rotation?: number; opacity?: number }
  | { type: 'set-clip-asset-crop'; sceneId: string; clipId: string; crop: ISparseAssetCrop }
  | { type: 'set-text-color'; sceneId: string; clipId: string; color: string }
  | { type: 'set-track-z-order'; sceneId: string; trackOrder: string[] }
  | { type: 'insert-clip'; sceneId: string; trackId: string; clip: ISparseClip }
  | { type: 'remove-clip'; sceneId: string; clipId: string }
  | { type: 'apply-sparse-patch'; sceneId: string; patch: ISparseSceneFragment }
  // Fan-out orchestration
  | { type: 'rebuild-scene-from-storyboard'; sceneId: string; reason?: string }
