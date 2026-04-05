import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveUploadSource } from '../src/upload-source'

describe('resolveUploadSource', () => {
  it('reads a workspace-relative local file and infers filename and content type', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'indream-upload-'))
    const filePath = join(tempDir, 'demo.jpg')
    await writeFile(filePath, Buffer.from('binary'))

    const result = await resolveUploadSource({
      filePath: './demo.jpg',
      workspaceDir: tempDir,
      allowLocalPaths: true,
      allowRemoteUrls: true,
    })

    expect(result.sourceKind).toBe('filePath')
    expect(result.filename).toBe('demo.jpg')
    expect(result.contentType).toBe('image/jpeg')
    expect(result.body.length).toBeGreaterThan(0)
  })

  it('downloads a remote asset and respects response metadata precedence', async () => {
    const result = await resolveUploadSource({
      sourceUrl: 'https://example.com/path/hero',
      allowLocalPaths: true,
      allowRemoteUrls: true,
      fetchFn: async () =>
        new Response(Buffer.from('remote'), {
          status: 200,
          headers: {
            'content-type': 'image/png',
            'content-disposition': 'attachment; filename=\"remote.png\"',
          },
        }),
    })

    expect(result.sourceKind).toBe('sourceUrl')
    expect(result.filename).toBe('remote.png')
    expect(result.contentType).toBe('image/png')
  })

  it('rejects invalid source selection', async () => {
    await expect(
      resolveUploadSource({
        allowLocalPaths: true,
        allowRemoteUrls: true,
      })
    ).rejects.toThrow('Exactly one of filePath or sourceUrl must be provided.')
  })
})
