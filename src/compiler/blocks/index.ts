import heroCard from './hero-card.json'
import splitLayout from './split-layout.json'
import ctaPrimary from './cta-primary.json'
import titleCard from './title-card.json'
import endCard from './end-card.json'
import captionCentered from './caption-centered.json'
import listStack from './list-stack.json'
import quoteCard from './quote-card.json'
import compareSplit from './compare-split.json'
import illustrationBoard from './illustration-board.json'

export interface IBlockDef {
  $id: string
  description: string
  supportedRatios: string[]
  requiredSlots: string[]
  optionalSlots: string[]
  overridableFields: string[]
  defaults: Record<string, unknown>
  skeleton: {
    tracks: Record<string, unknown[]>
  }
}

const BLOCK_REGISTRY: Record<string, IBlockDef> = {
  'block:hero-card': heroCard as unknown as IBlockDef,
  'block:split-layout': splitLayout as unknown as IBlockDef,
  'block:cta-primary': ctaPrimary as unknown as IBlockDef,
  'block:title-card': titleCard as unknown as IBlockDef,
  'block:end-card': endCard as unknown as IBlockDef,
  'block:caption-centered': captionCentered as unknown as IBlockDef,
  'block:list-stack': listStack as unknown as IBlockDef,
  'block:quote-card': quoteCard as unknown as IBlockDef,
  'block:compare-split': compareSplit as unknown as IBlockDef,
  'block:illustration-board': illustrationBoard as unknown as IBlockDef,
}

export const getBlock = (id: string): IBlockDef | null => BLOCK_REGISTRY[id] ?? null

export const listBlocks = (): Array<
  Pick<IBlockDef, '$id' | 'description' | 'supportedRatios' | 'requiredSlots' | 'optionalSlots'>
> =>
  Object.values(BLOCK_REGISTRY).map((b) => ({
    $id: b.$id,
    description: b.description,
    supportedRatios: b.supportedRatios,
    requiredSlots: b.requiredSlots,
    optionalSlots: b.optionalSlots,
  }))

export const BLOCK_IDS = Object.keys(BLOCK_REGISTRY)
