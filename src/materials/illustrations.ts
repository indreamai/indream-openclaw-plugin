import type { IIndreamClientLike } from '../tools/shared'

const MAX_ILLUSTRATION_RESULTS = 12
const MIN_QUERY_LENGTH = 2

const readSupportedIllustrations = async (client: IIndreamClientLike) => {
  const payload = await client.editor.capabilities()
  const record =
    typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}

  const items = Array.isArray(record.illustrations)
    ? record.illustrations
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : []

  return {
    items,
    lowerCaseMap: new Map(items.map((item) => [item.toLowerCase(), item])),
  }
}

export const normalizeIllustrationQuery = (value: unknown) => {
  if (typeof value !== 'string') {
    throw new Error('q is required.')
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('q must not be empty.')
  }
  if (trimmed.length < MIN_QUERY_LENGTH) {
    throw new Error('q must be at least ' + String(MIN_QUERY_LENGTH) + ' characters.')
  }
  if (/\s/.test(trimmed)) {
    throw new Error('q must be a single word without spaces.')
  }
  return trimmed
}

export const searchIllustrations = async (params: {
  client: IIndreamClientLike
  q: string
  limit?: number
}) => {
  const q = normalizeIllustrationQuery(params.q)
  const [rows, supported] = await Promise.all([
    params.client.illustrations.search(q),
    readSupportedIllustrations(params.client),
  ])

  const rawNames = rows
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
  const names =
    supported.items.length === 0
      ? rawNames
      : rawNames
          .map((item) => supported.lowerCaseMap.get(item.toLowerCase()) ?? null)
          .filter((item): item is string => Boolean(item))
  const limit = Math.max(1, Math.min(MAX_ILLUSTRATION_RESULTS, params.limit || MAX_ILLUSTRATION_RESULTS))

  const dedupedNames = [...new Set(names)]
  return {
    q,
    items: dedupedNames.slice(0, limit),
    truncated: dedupedNames.length > limit,
  }
}

export const pickIllustrationName = async (params: {
  client: IIndreamClientLike
  illustrationName?: string
  illustrationQuery?: string
}) => {
  if (params.illustrationName && params.illustrationName.trim()) {
    const normalizedName = params.illustrationName.trim()
    const supported = await readSupportedIllustrations(params.client)
    const supportedMatch = supported.lowerCaseMap.get(normalizedName.toLowerCase())

    if (supportedMatch) {
      return {
        illustrationName: supportedMatch,
        candidates: [supportedMatch],
        q: params.illustrationQuery?.trim() || normalizedName,
      }
    }

    if (supported.items.length === 0) {
      return {
        illustrationName: normalizedName,
        candidates: [normalizedName],
        q: params.illustrationQuery?.trim() || normalizedName,
      }
    }

    const searchResult = await searchIllustrations({
      client: params.client,
      q: normalizedName,
      limit: MAX_ILLUSTRATION_RESULTS,
    })

    const exactMatch = searchResult.items.find(
      (item) => item.toLowerCase() === normalizedName.toLowerCase()
    )
    if (exactMatch) {
      return {
        illustrationName: exactMatch,
        candidates: searchResult.items,
        q: params.illustrationQuery?.trim() || normalizedName,
      }
    }

    if (searchResult.items.length === 1) {
      return {
        illustrationName: searchResult.items[0],
        candidates: searchResult.items,
        q: params.illustrationQuery?.trim() || normalizedName,
      }
    }

    throw new Error(
      'Unsupported illustrationName: ' +
        normalizedName +
        '. Use indream_illustrations_search or indream_editor_capabilities fields=["illustrations"].'
    )
  }

  const q = normalizeIllustrationQuery(params.illustrationQuery)
  const searchResult = await searchIllustrations({
    client: params.client,
    q,
    limit: MAX_ILLUSTRATION_RESULTS,
  })

  if (searchResult.items.length === 0) {
    throw new Error('No illustration matched q="' + q + '".')
  }

  const exact = searchResult.items.find((item) => item.toLowerCase() === q.toLowerCase())
  if (exact) {
    return {
      illustrationName: exact,
      candidates: searchResult.items,
      q,
    }
  }

  if (searchResult.items.length === 1) {
    return {
      illustrationName: searchResult.items[0],
      candidates: searchResult.items,
      q,
    }
  }

  throw new Error('Illustration query is ambiguous. Candidates: ' + searchResult.items.join(', '))
}
