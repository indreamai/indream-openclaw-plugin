import { describe, expect, it } from 'vitest'
import manifest from '../openclaw.plugin.json'
import {
  DEFAULT_BASE_URL,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  buildMissingApiKeyMessage,
  pluginConfigSchema,
  resolvePluginConfig,
} from '../src/config'

describe('plugin config', () => {
  it('exposes sensitive api key ui hints in manifest', () => {
    expect(manifest.uiHints.apiKey.sensitive).toBe(true)
    expect('required' in manifest.configSchema).toBe(false)
  })

  it('applies defaults when config is absent', () => {
    expect(resolvePluginConfig(undefined)).toEqual({
      apiKey: undefined,
      baseURL: DEFAULT_BASE_URL,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
      uploads: {
        allowLocalPaths: true,
        allowRemoteUrls: true,
      },
    })
  })

  it('allows install-time config without apiKey', () => {
    const result = pluginConfigSchema.validate?.({
      baseURL: DEFAULT_BASE_URL,
    })

    expect(result?.ok).toBe(true)
    expect(buildMissingApiKeyMessage()).toContain('plugins.entries.indream.config.apiKey')
  })

  it('rejects blank apiKey when provided', () => {
    const result = pluginConfigSchema.validate?.({
      apiKey: '   ',
    })

    expect(result?.ok).toBe(false)
    expect(result && 'errors' in result ? result.errors : []).toContain(
      'apiKey must be a non-empty string.'
    )
    expect(buildMissingApiKeyMessage()).toContain('plugins.entries.indream.config.apiKey')
  })
})
