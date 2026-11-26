import type { StampKind } from '../../types'

export const STAMP_COLORS: Record<StampKind, string> = {
  APPROVED: '#15803d',
  CONFIDENTIAL: '#b91c1c',
  DRAFT: '#1d4ed8',
  PAID: '#15803d',
}

export const STAMP_KINDS = Object.keys(STAMP_COLORS) as StampKind[]
