import type { IWorkflowBrief, TWorkflowRouteMode } from './types'
import { WORKFLOW_ROUTE_MODE_VALUES } from './types'

const EXPLAINER_HINT_RE = /explain|explainer|tutorial|guide|how\s+to|concept|education|teach|learn/iu
const SPEECH_HINT_RE = /podcast|interview|speech|talk|trim|recut|lecture|caption/iu

export const isWorkflowRouteMode = (value: string): value is TWorkflowRouteMode =>
  WORKFLOW_ROUTE_MODE_VALUES.includes(value as TWorkflowRouteMode)

export const routeWorkflowMode = (
  brief: IWorkflowBrief,
  explicitMode?: string
): TWorkflowRouteMode => {
  if (explicitMode && isWorkflowRouteMode(explicitMode)) return explicitMode

  const combined = [brief.topic, brief.goal, brief.audience, brief.transcript]
    .filter((e): e is string => Boolean(e))
    .join(' ')

  if (brief.transcript?.trim()) return 'speech-edit'
  if (SPEECH_HINT_RE.test(combined)) return 'speech-edit'
  if (EXPLAINER_HINT_RE.test(combined)) return 'explainer'
  return 'product-demo'
}

/** Preferred block choices per route mode (used when storyboard doesn't specify blockRef) */
export const ROUTE_MODE_DEFAULT_BLOCKS: Record<TWorkflowRouteMode, string[]> = {
  'speech-edit': ['block:caption-centered', 'block:hero-card'],
  'product-demo': ['block:hero-card', 'block:split-layout', 'block:cta-primary'],
  explainer: ['block:title-card', 'block:list-stack', 'block:illustration-board', 'block:cta-primary'],
}
