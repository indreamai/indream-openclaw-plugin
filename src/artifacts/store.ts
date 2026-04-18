import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import type {
  ICompiledWorkflowArtifact,
  IWorkflowArtifact,
  IWorkflowArtifactSummary,
  IWorkflowCheckpointSnapshot,
  IWorkflowProjectBindingRecord,
  IWorkflowReviewSummary,
  IWorkflowBrief,
  IStoryboardV6,
  TWorkflowRouteMode,
} from '../workflow/types'
import { ArtifactFileStore } from './file-store'
import { summarizeStoryboard } from '../workflow/summary'

class ArtifactStore {
  private readonly workflowArtifacts = new Map<string, IWorkflowArtifact>()
  private readonly compiledArtifacts = new Map<string, ICompiledWorkflowArtifact>()
  private readonly projectBindings = new Map<string, IWorkflowProjectBindingRecord>()
  private fileStore: ArtifactFileStore | null = null

  /** Call once on plugin init to enable file persistence */
  setWorkspaceDir(workspaceDir: string | undefined): void {
    this.fileStore = new ArtifactFileStore(workspaceDir)
    this.workflowArtifacts.clear()
    this.compiledArtifacts.clear()
    this.projectBindings.clear()

    // Reload from the current workspace persistence directory so different
    // workspaces do not leak artifact state into each other.
    for (const id of this.fileStore.listArtifacts()) {
      const a = this.fileStore.loadWorkflow(id)
      if (a) this.workflowArtifacts.set(id, a)
    }
    for (const id of this.fileStore.listCompiledArtifacts()) {
      const artifact = this.fileStore.loadCompiledArtifact(id)
      if (artifact) this.compiledArtifacts.set(id, artifact)
    }
    for (const projectId of this.fileStore.listProjectBindings()) {
      const binding = this.fileStore.loadProjectBinding(projectId)
      if (binding) this.projectBindings.set(projectId, binding)
    }
  }

  private persist(artifact: IWorkflowArtifact): void {
    this.fileStore?.saveWorkflow(artifact)
  }

  createWorkflow(params: {
    routeMode: TWorkflowRouteMode
    brief: IWorkflowBrief
    storyboard: IStoryboardV6
    latestReview: IWorkflowReviewSummary
    summary: IWorkflowArtifactSummary
    artifactDir: string
  }): IWorkflowArtifact {
    const now = new Date().toISOString()
    const artifact: IWorkflowArtifact = {
      artifactId: 'vw-' + randomUUID().replace(/-/g, ''),
      kind: 'workflow',
      routeMode: params.routeMode,
      brief: params.brief,
      storyboard: params.storyboard,
      currentGate: 'capture',
      gateStatuses: [],
      submittedSceneIds: [],
      latestReview: params.latestReview,
      checkpoints: [],
      summary: params.summary,
      artifactDir: params.artifactDir,
      createdAt: now,
      updatedAt: now,
    }
    this.workflowArtifacts.set(artifact.artifactId, artifact)
    this.persist(artifact)
    return artifact
  }

  updateWorkflow(
    artifactId: string,
    patch: Partial<
      Pick<
        IWorkflowArtifact,
        | 'brief'
        | 'storyboard'
        | 'latestReview'
        | 'summary'
        | 'routeMode'
        | 'currentGate'
        | 'gateStatuses'
        | 'submittedSceneIds'
      >
    > & { checkpoint?: IWorkflowCheckpointSnapshot }
  ): IWorkflowArtifact {
    const existing = this.getWorkflow(artifactId)
    const storyboard = patch.storyboard ?? existing.storyboard
    const currentGate = patch.currentGate ?? existing.currentGate
    const submittedSceneIds = patch.submittedSceneIds ?? existing.submittedSceneIds
    const summary =
      patch.summary ??
      summarizeStoryboard({
        storyboard,
        currentGate,
        submittedSceneIds,
      })

    const next: IWorkflowArtifact = {
      ...existing,
      ...patch,
      storyboard,
      currentGate,
      submittedSceneIds,
      summary,
      checkpoints: patch.checkpoint
        ? [...existing.checkpoints, patch.checkpoint]
        : existing.checkpoints,
      updatedAt: new Date().toISOString(),
    }
    this.workflowArtifacts.set(artifactId, next)
    this.persist(next)
    return next
  }

  getWorkflow(artifactId: string): IWorkflowArtifact {
    const artifact = this.workflowArtifacts.get(artifactId)
    if (!artifact) throw new Error(`Unknown workflow artifactId: ${artifactId}`)
    return artifact
  }

  listWorkflows(): IWorkflowArtifact[] {
    return [...this.workflowArtifacts.values()]
  }

  createCompiled(params: {
    workflowArtifactId: string
    editorState: ICompiledWorkflowArtifact['editorState']
    reviewSnapshot: IWorkflowReviewSummary
  }): ICompiledWorkflowArtifact {
    const now = new Date().toISOString()
    const editorStateHash = createHash('sha256')
      .update(JSON.stringify(params.editorState))
      .digest('hex')
      .slice(0, 16)
    const artifact: ICompiledWorkflowArtifact = {
      artifactId: 'vc-' + randomUUID().replace(/-/g, ''),
      kind: 'compiled-workflow',
      workflowArtifactId: params.workflowArtifactId,
      editorState: params.editorState,
      editorStateHash,
      reviewSnapshot: params.reviewSnapshot,
      createdAt: now,
      updatedAt: now,
    }
    this.compiledArtifacts.set(artifact.artifactId, artifact)
    this.fileStore?.saveCompiledArtifact(artifact)
    return artifact
  }

  getCompiled(artifactId: string): ICompiledWorkflowArtifact {
    const artifact = this.compiledArtifacts.get(artifactId)
    if (!artifact) throw new Error(`Unknown compiled artifactId: ${artifactId}`)
    return artifact
  }

  bindProject(
    projectId: string,
    workflowArtifactId: string,
    compiledArtifactId: string
  ): void {
    const binding = {
      projectId,
      workflowArtifactId,
      compiledArtifactId,
      updatedAt: new Date().toISOString(),
    }
    this.projectBindings.set(projectId, binding)
    this.fileStore?.saveProjectBinding(binding)
  }

  getProjectBinding(projectId: string): IWorkflowProjectBindingRecord | null {
    return this.projectBindings.get(projectId) ?? null
  }

  getFileStore(): ArtifactFileStore | null {
    return this.fileStore
  }
}

export const artifactStore = new ArtifactStore()
