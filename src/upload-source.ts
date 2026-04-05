import { readFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { lookup as lookupMimeType } from 'mime-types'

export interface IResolveUploadSourceParams {
  filePath?: string
  sourceUrl?: string
  filename?: string
  contentType?: string
  workspaceDir?: string
  allowLocalPaths: boolean
  allowRemoteUrls: boolean
  fetchFn?: typeof fetch
}

export interface IResolvedUploadSource {
  body: Buffer
  filename: string
  contentType: string
  sourceKind: 'filePath' | 'sourceUrl'
  source: string
}

const readOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const inferMimeTypeFromPath = (value: string) => {
  const mimeType = lookupMimeType(value)
  return typeof mimeType === 'string' ? mimeType : undefined
}

const parseContentDispositionFilename = (value: string | null) => {
  if (!value) {
    return undefined
  }

  const utf8Match = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^"+|"+$/g, ''))
    } catch {
      return utf8Match[1].trim().replace(/^"+|"+$/g, '')
    }
  }

  const basicMatch = value.match(/filename\s*=\s*"?(.*?)"?(?:;|$)/i)
  return readOptionalString(basicMatch?.[1])
}

const inferFilenameFromUrl = (value: string) => {
  const parsed = new URL(value)
  return readOptionalString(basename(parsed.pathname))
}

const inferFilenameFromPath = (value: string) => {
  return readOptionalString(basename(value))
}

const resolveLocalFilePath = (value: string, workspaceDir?: string) => {
  if (value.startsWith('~')) {
    throw new Error('filePath does not support "~". Use an absolute path or a workspace-relative path.')
  }

  return value.startsWith('/') ? value : resolve(workspaceDir || process.cwd(), value)
}

export const resolveUploadSource = async (
  params: IResolveUploadSourceParams
): Promise<IResolvedUploadSource> => {
  const filePath = readOptionalString(params.filePath)
  const sourceUrl = readOptionalString(params.sourceUrl)
  const explicitFilename = readOptionalString(params.filename)
  const explicitContentType = readOptionalString(params.contentType)

  if ((filePath && sourceUrl) || (!filePath && !sourceUrl)) {
    throw new Error('Exactly one of filePath or sourceUrl must be provided.')
  }

  if (filePath) {
    if (!params.allowLocalPaths) {
      throw new Error('Local file uploads are disabled in the plugin config.')
    }

    const resolvedPath = resolveLocalFilePath(filePath, params.workspaceDir)
    const body = await readFile(resolvedPath)
    const filename = explicitFilename || inferFilenameFromPath(resolvedPath)
    if (!filename) {
      throw new Error('Could not infer filename from filePath. Pass filename explicitly.')
    }

    const contentType =
      explicitContentType || inferMimeTypeFromPath(filename) || inferMimeTypeFromPath(resolvedPath)
    if (!contentType) {
      throw new Error(
        `Could not infer contentType for ${basename(resolvedPath) || resolvedPath}. Pass contentType explicitly.`
      )
    }

    return {
      body,
      filename,
      contentType,
      sourceKind: 'filePath',
      source: resolvedPath,
    }
  }

  if (!params.allowRemoteUrls) {
    throw new Error('Remote URL uploads are disabled in the plugin config.')
  }

  const parsedUrl = new URL(sourceUrl as string)
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('sourceUrl must use http or https.')
  }

  const fetchFn = params.fetchFn || fetch
  const response = await fetchFn(parsedUrl, {
    redirect: 'follow',
  })
  if (!response.ok) {
    throw new Error(`Failed to download sourceUrl. HTTP ${response.status}.`)
  }

  const body = Buffer.from(await response.arrayBuffer())

  // Keep source inference stable: explicit params first, then response headers, then the URL path.
  const filename =
    explicitFilename ||
    parseContentDispositionFilename(response.headers.get('content-disposition')) ||
    inferFilenameFromUrl(sourceUrl as string) ||
    `download${extname(parsedUrl.pathname) || '.bin'}`

  const contentType =
    explicitContentType ||
    readOptionalString(response.headers.get('content-type')?.split(';')[0]) ||
    inferMimeTypeFromPath(filename) ||
    inferMimeTypeFromPath(parsedUrl.pathname)

  if (!contentType) {
    throw new Error('Could not infer contentType from sourceUrl. Pass contentType explicitly.')
  }

  return {
    body,
    filename,
    contentType,
    sourceKind: 'sourceUrl',
    source: sourceUrl as string,
  }
}
