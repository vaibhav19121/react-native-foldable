export type FoldStatus =
  | 'closed'
  | 'partiallyOpen'
  | 'fullyOpen'
  | 'unknown'
  | 'unsupported';

export type HingeOrientation = 'vertical' | 'horizontal';

/** The hinge/fold area inside the app window, in dp (same units as React Native layout). */
export type HingeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  orientation: HingeOrientation;
  /** True when the fold splits the window into two logical areas (e.g. tabletop / book mode). */
  isSeparating: boolean;
  /** True when the hinge physically hides content (e.g. dual-screen devices). */
  isOccluding: boolean;
};

export type FoldableInfo = {
  /** Whether the OS exposed a hinge sensor or folding feature. */
  isSupported: boolean;
  /** Normalized physical hinge posture. */
  status: FoldStatus;
  /** Hinge angle in degrees: 0 = closed, ~180 = flat. Null when the device has no hinge sensor. */
  angle: number | null;
  /** Fold location inside the current window. Null when the app is not spanning the fold. */
  hinge: HingeBounds | null;
  isFolded: boolean;
  isUnfolded: boolean;
  isPartiallyFolded: boolean;
};

const CLOSED_MAX_ANGLE = 10;
const FLAT_MIN_ANGLE = 170;

export const UNSUPPORTED_FOLDABLE_INFO: FoldableInfo = {
  isSupported: false,
  status: 'unsupported',
  angle: null,
  hinge: null,
  isFolded: false,
  isUnfolded: false,
  isPartiallyFolded: false,
};

const STATUSES: FoldStatus[] = ['closed', 'partiallyOpen', 'fullyOpen', 'unknown', 'unsupported'];

function statusFromAngle(angle: number): FoldStatus {
  if (angle <= CLOSED_MAX_ANGLE) return 'closed';
  if (angle >= FLAT_MIN_ANGLE) return 'fullyOpen';
  return 'partiallyOpen';
}

function normalizeHinge(input: any): HingeBounds | null {
  if (!input || typeof input !== 'object') return null;
  return {
    x: Number(input.x) || 0,
    y: Number(input.y) || 0,
    width: Number(input.width) || 0,
    height: Number(input.height) || 0,
    orientation: input.orientation === 'horizontal' ? 'horizontal' : 'vertical',
    isSeparating: Boolean(input.isSeparating),
    isOccluding: Boolean(input.isOccluding),
  };
}

/** Converts a raw native payload into a fully-populated FoldableInfo. */
export function normalizeFoldableInfo(input?: any): FoldableInfo {
  if (!input || !input.isSupported) return UNSUPPORTED_FOLDABLE_INFO;

  const angle =
    typeof input.angle === 'number' && Number.isFinite(input.angle)
      ? Math.max(0, Math.min(180, input.angle))
      : null;
  // Prefer the OS-reported posture; fall back to the angle when it is unknown
  // (e.g. Android on the cover screen, where no folding feature is reported).
  const nativeStatus: FoldStatus = STATUSES.includes(input.status) ? input.status : 'unknown';
  const status: FoldStatus =
    nativeStatus === 'unknown' && angle !== null ? statusFromAngle(angle) : nativeStatus;

  return {
    isSupported: true,
    status,
    angle,
    hinge: normalizeHinge(input.hinge),
    isFolded: status === 'closed',
    isUnfolded: status === 'fullyOpen',
    isPartiallyFolded: status === 'partiallyOpen',
  };
}
