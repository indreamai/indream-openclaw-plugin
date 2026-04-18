import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type {
  ICompiledWorkflowArtifact,
  IWorkflowArtifact,
  IWorkflowProjectBindingRecord,
  ISparseSceneFragment,
} from '../workflow/types'
import type { IAssetAnalysis } from '../analysis/types'

const DEFAULT_BASE_DIR = path.join(os.homedir(), '.indream')

export class ArtifactFileStore {
  private readonly baseDir: string

  constructor(workspaceDir?: string) {
    this.baseDir = workspaceDir
      ? path.join(workspaceDir, '.indream')
      : DEFAULT_BASE_DIR
  }

  private workflowDir(artifactId: string): string {
    return path.join(this.baseDir, 'workflow', artifactId)
  }

  private compiledDir(artifactId: string): string {
    return path.join(this.baseDir, 'compiled', artifactId)
  }

  private projectBindingDir(): string {
    return path.join(this.baseDir, 'project-bindings')
  }

  private analysisDir(): string {
    return path.join(this.baseDir, 'analysis')
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  // -------------------------------------------------------------------------
  // Workflow artifact JSON
  // -------------------------------------------------------------------------

  saveWorkflow(artifact: IWorkflowArtifact): void {
    const dir = this.workflowDir(artifact.artifactId)
    this.ensureDir(dir)
    fs.writeFileSync(
      path.join(dir, 'artifact.json'),
      JSON.stringify(artifact, null, 2),
      'utf-8'
    )
  }

  loadWorkflow(artifactId: string): IWorkflowArtifact | null {
    try {
      const p = path.join(this.workflowDir(artifactId), 'artifact.json')
      if (!fs.existsSync(p)) return null
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as IWorkflowArtifact
    } catch {
      return null
    }
  }

  // -------------------------------------------------------------------------
  // Compiled artifact JSON
  // -------------------------------------------------------------------------

  saveCompiledArtifact(artifact: ICompiledWorkflowArtifact): void {
    const dir = this.compiledDir(artifact.artifactId)
    this.ensureDir(dir)
    fs.writeFileSync(
      path.join(dir, 'artifact.json'),
      JSON.stringify(artifact, null, 2),
      'utf-8'
    )
  }

  loadCompiledArtifact(artifactId: string): ICompiledWorkflowArtifact | null {
    try {
      const filePath = path.join(this.compiledDir(artifactId), 'artifact.json')
      if (!fs.existsSync(filePath)) return null
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ICompiledWorkflowArtifact
    } catch {
      return null
    }
  }

  compiledArtifactExists(artifactId: string): boolean {
    return fs.existsSync(path.join(this.compiledDir(artifactId), 'artifact.json'))
  }

  listCompiledArtifacts(): string[] {
    const dir = path.join(this.baseDir, 'compiled')
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((entry) => this.compiledArtifactExists(entry))
  }

  // -------------------------------------------------------------------------
  // Project binding JSON
  // -------------------------------------------------------------------------

  saveProjectBinding(binding: IWorkflowProjectBindingRecord): void {
    const dir = this.projectBindingDir()
    this.ensureDir(dir)
    fs.writeFileSync(
      path.join(dir, `${binding.projectId}.json`),
      JSON.stringify(binding, null, 2),
      'utf-8'
    )
  }

  loadProjectBinding(projectId: string): IWorkflowProjectBindingRecord | null {
    try {
      const filePath = path.join(this.projectBindingDir(), `${projectId}.json`)
      if (!fs.existsSync(filePath)) return null
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as IWorkflowProjectBindingRecord
    } catch {
      return null
    }
  }

  listProjectBindings(): string[] {
    const dir = this.projectBindingDir()
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => entry.replace(/\.json$/, ''))
  }

  // -------------------------------------------------------------------------
  // Phase artifacts (DESIGN.md, SCRIPT.md, STORYBOARD.md, storyboard.json)
  // -------------------------------------------------------------------------

  writePhaseArtifact(
    artifactId: string,
    phase: 'design' | 'script' | 'storyboard' | 'editor-state',
    content: string | object
  ): string {
    const dir = this.workflowDir(artifactId)
    this.ensureDir(dir)
    const ext = typeof content === 'string' ? 'md' : 'json'
    const fileNames: Record<string, string> = {
      design: `DESIGN.md`,
      script: `SCRIPT.md`,
      storyboard: typeof content === 'string' ? 'STORYBOARD.md' : 'storyboard.json',
      'editor-state': 'editor-state.json',
    }
    const filename = fileNames[phase] ?? `${phase}.${ext}`
    const filePath = path.join(dir, filename)
    const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    fs.writeFileSync(filePath, data, 'utf-8')
    return filePath
  }

  readPhaseArtifact(
    artifactId: string,
    phase: 'design' | 'script' | 'storyboard' | 'editor-state',
    format: 'string' | 'json' = 'string'
  ): string | object | null {
    const dir = this.workflowDir(artifactId)
    const candidates = [
      path.join(dir, `${phase.toUpperCase()}.md`),
      path.join(dir, `${phase}.md`),
      path.join(dir, `${phase}.json`),
      path.join(dir, `editor-state.json`),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8')
        if (format === 'json') {
          try { return JSON.parse(raw) as object } catch { return raw }
        }
        return raw
      }
    }
    return null
  }

  // -------------------------------------------------------------------------
  // Scene sparse JSON (sub-agent output)
  // -------------------------------------------------------------------------

  writeSceneSparse(
    artifactId: string,
    sceneId: string,
    sparse: ISparseSceneFragment
  ): string {
    const dir = path.join(this.workflowDir(artifactId), 'scenes')
    this.ensureDir(dir)
    const filePath = path.join(dir, `${sceneId}.sparse.json`)
    fs.writeFileSync(filePath, JSON.stringify(sparse, null, 2), 'utf-8')
    return filePath
  }

  readSceneSparse(
    artifactId: string,
    sceneId: string
  ): ISparseSceneFragment | null {
    try {
      const p = path.join(this.workflowDir(artifactId), 'scenes', `${sceneId}.sparse.json`)
      if (!fs.existsSync(p)) return null
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as ISparseSceneFragment
    } catch {
      return null
    }
  }

  listSceneSparse(artifactId: string): Array<{ sceneId: string; path: string }> {
    const dir = path.join(this.workflowDir(artifactId), 'scenes')
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sparse.json'))
      .map((f) => ({
        sceneId: f.replace('.sparse.json', ''),
        path: path.join(dir, f),
      }))
  }

  // -------------------------------------------------------------------------
  // Checkpoints
  // -------------------------------------------------------------------------

  writeCheckpoint(artifactId: string, data: object): string {
    const dir = path.join(this.workflowDir(artifactId), 'checkpoints')
    this.ensureDir(dir)
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(dir, `${ts}.json`)
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return filePath
  }

  // -------------------------------------------------------------------------
  // Asset analysis cache
  // -------------------------------------------------------------------------

  writeAnalysisCache(analysis: IAssetAnalysis): void {
    const dir = this.analysisDir()
    this.ensureDir(dir)
    fs.writeFileSync(
      path.join(dir, `${analysis.assetId}.json`),
      JSON.stringify(analysis, null, 2),
      'utf-8'
    )
  }

  readAnalysisCache(assetId: string): IAssetAnalysis | null {
    try {
      const p = path.join(this.analysisDir(), `${assetId}.json`)
      if (!fs.existsSync(p)) return null
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as IAssetAnalysis
    } catch {
      return null
    }
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  artifactExists(artifactId: string): boolean {
    return fs.existsSync(path.join(this.workflowDir(artifactId), 'artifact.json'))
  }

  listArtifacts(): string[] {
    const dir = path.join(this.baseDir, 'workflow')
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((f) => this.artifactExists(f))
  }
}
