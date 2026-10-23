import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useFoldable } from './foldable';
import type { FoldableInfo, HingeBounds } from './types';
import { UNSUPPORTED_FOLDABLE_INFO } from './types';

export type ScreenClass = 'compact' | 'medium' | 'expanded';

export type Frame = { x: number; y: number; width: number; height: number };

export type FoldableLayoutValue = {
  info: FoldableInfo;
  /** Size of the whole area FoldableLayout occupies (normally the window). */
  window: { width: number; height: number };
  /** The area children are actually laid out in, relative to the window. */
  content: Frame;
  /** Material window size class of the full window width. */
  screenClass: ScreenClass;
  /** Lifts the max-width constraint until the returned release function is called. */
  requestFullWidth: () => () => void;
};

const COMPACT_MAX_WIDTH = 600;
const MEDIUM_MAX_WIDTH = 840;
// No cap by default: content fills the screen. Pass e.g. maxWidth={600} for a centered column.
const DEFAULT_MAX_WIDTH = Number.POSITIVE_INFINITY;

export function screenClassForWidth(width: number): ScreenClass {
  if (width < COMPACT_MAX_WIDTH) return 'compact';
  if (width < MEDIUM_MAX_WIDTH) return 'medium';
  return 'expanded';
}

/** A hinge content should not be drawn across: it splits the screen or hides pixels. */
function blockingHinge(hinge: HingeBounds | null): HingeBounds | null {
  if (!hinge) return null;
  if (hinge.orientation === 'vertical') return hinge.isSeparating || hinge.isOccluding ? hinge : null;
  // A separating horizontal fold is tabletop mode; moving the whole app into the
  // top half would be surprising, so only avoid hinges that actually hide pixels.
  return hinge.isOccluding ? hinge : null;
}

/** Picks the larger side of the hinge (the start side on a tie). */
function regionBesideHinge(area: Frame, hinge: HingeBounds): Frame {
  if (hinge.orientation === 'vertical') {
    const startWidth = hinge.x - area.x;
    const endX = hinge.x + hinge.width;
    const endWidth = area.x + area.width - endX;
    return startWidth >= endWidth
      ? { ...area, width: startWidth }
      : { ...area, x: endX, width: endWidth };
  }
  const startHeight = hinge.y - area.y;
  const endY = hinge.y + hinge.height;
  const endHeight = area.y + area.height - endY;
  return startHeight >= endHeight
    ? { ...area, height: startHeight }
    : { ...area, y: endY, height: endHeight };
}

export function computeContentFrame(
  window: { width: number; height: number },
  hinge: HingeBounds | null,
  options: { maxWidth: number; fullWidth: boolean; avoidHinge: boolean }
): Frame {
  const area: Frame = { x: 0, y: 0, width: window.width, height: window.height };
  // A full-width request comes from DualPane, which lays itself out around the hinge.
  if (options.fullWidth) return area;

  const blocking = options.avoidHinge ? blockingHinge(hinge) : null;
  const region = blocking ? regionBesideHinge(area, blocking) : area;
  if (region.width <= 0 || region.height <= 0) return area;

  const width = Math.min(region.width, options.maxWidth);
  return { ...region, x: region.x + (region.width - width) / 2, width };
}

const FoldableLayoutContext = createContext<FoldableLayoutValue | null>(null);

export type FoldableLayoutProps = {
  children: ReactNode;
  /** Widest the content may get on unfolded / large screens (centered). Default: no limit. */
  maxWidth?: number;
  /** Keep content off a separating or occluding hinge. Default true. */
  avoidHinge?: boolean;
  /** Fills the space beside the constrained content. */
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Wrap the app root with this to make screens behave on foldables: content fills
 * the screen, moves off the hinge in book mode, and can optionally be kept to a
 * centered `maxWidth` on large screens.
 */
export function FoldableLayout({
  children,
  maxWidth = DEFAULT_MAX_WIDTH,
  avoidHinge = true,
  backgroundColor,
  style,
}: FoldableLayoutProps) {
  const info = useFoldable();
  const windowDimensions = useWindowDimensions();
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const [fullWidthRequests, setFullWidthRequests] = useState(0);

  const area = measured ?? { width: windowDimensions.width, height: windowDimensions.height };

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setMeasured((previous) =>
      previous && previous.width === width && previous.height === height ? previous : { width, height }
    );
  }, []);

  const requestFullWidth = useCallback(() => {
    setFullWidthRequests((count) => count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setFullWidthRequests((count) => count - 1);
    };
  }, []);

  const content = useMemo(
    () =>
      computeContentFrame(area, info.hinge, {
        maxWidth,
        fullWidth: fullWidthRequests > 0,
        avoidHinge,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [area.width, area.height, info.hinge, maxWidth, fullWidthRequests, avoidHinge]
  );

  const value = useMemo<FoldableLayoutValue>(
    () => ({
      info,
      window: area,
      content,
      screenClass: screenClassForWidth(area.width),
      requestFullWidth,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [info, area.width, area.height, content, requestFullWidth]
  );

  return (
    <FoldableLayoutContext.Provider value={value}>
      <View style={[styles.root, backgroundColor ? { backgroundColor } : null, style]} onLayout={onLayout}>
        <View
          style={[
            styles.content,
            { left: content.x, top: content.y, width: content.width, height: content.height },
          ]}
        >
          {children}
        </View>
      </View>
    </FoldableLayoutContext.Provider>
  );
}

/** Layout and fold state from the nearest FoldableLayout (falls back to the window if there is none). */
export function useFoldableLayout(): FoldableLayoutValue {
  const value = useContext(FoldableLayoutContext);
  const { width, height } = useWindowDimensions();
  if (value) return value;
  return {
    info: UNSUPPORTED_FOLDABLE_INFO,
    window: { width, height },
    content: { x: 0, y: 0, width, height },
    screenClass: screenClassForWidth(width),
    requestFullWidth: () => () => undefined,
  };
}

/** 'compact' | 'medium' | 'expanded' for the full window width. */
export function useScreenClass(): ScreenClass {
  return useFoldableLayout().screenClass;
}

function splittingHinge(hinge: HingeBounds | null): HingeBounds | null {
  return hinge && (hinge.isSeparating || hinge.isOccluding) ? hinge : null;
}

/**
 * Whether a DualPane with the same `minWidth` would show two panes. Use it to switch
 * between showing a detail inline and navigating to it.
 */
export function useDualPaneActive(minWidth: number = COMPACT_MAX_WIDTH): boolean {
  const { info, window } = useFoldableLayout();
  return splittingHinge(info.hinge) != null || window.width >= minWidth;
}

export type TabBarPosition = 'bottom' | 'left' | 'right';

export type AdaptiveTabBarOptions = {
  /** Side the tab bar moves to when the device is open. Default 'left'. */
  side?: 'left' | 'right';
  /** Window width at which the tab bar moves to the side. Default 600. */
  minWidth?: number;
};

/**
 * Bottom on phones / folded devices, a vertical rail on `side` when open (same rule as DualPane).
 * Pass the result to React Navigation's `tabBarPosition` screen option.
 */
export function useAdaptiveTabBarPosition({
  side = 'left',
  minWidth = COMPACT_MAX_WIDTH,
}: AdaptiveTabBarOptions = {}): TabBarPosition {
  return useDualPaneActive(minWidth) ? side : 'bottom';
}

export type DualPaneProps = {
  /** Always shown (e.g. a list). On narrow screens this is the only pane. */
  primary: ReactNode;
  /** Shown beside / below `primary` when there is room (e.g. the selected item's detail). */
  secondary?: ReactNode;
  /** Window width at which two panes are shown when there is no hinge. Default 600. */
  minWidth?: number;
  /** Fraction of the width given to `primary` when splitting without a hinge. Default 0.4. */
  ratio?: number;
  /**
   * Set to false while the screen is not visible (e.g. `useIsFocused()` from React Navigation),
   * so a DualPane on a screen lower in the stack doesn't keep the app full-width.
   */
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Opt-in two-pane layout. Splits exactly at the hinge in book / tabletop posture,
 * by `ratio` on wide screens, and shows only `primary` on narrow screens.
 */
export function DualPane({
  primary,
  secondary,
  minWidth = COMPACT_MAX_WIDTH,
  ratio = 0.4,
  enabled = true,
  style,
}: DualPaneProps) {
  const { info, requestFullWidth } = useFoldableLayout();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const [frame, setFrame] = useState<Frame | null>(null);

  const hinge = splittingHinge(info.hinge);
  const twoPane = useDualPaneActive(minWidth) && enabled && secondary != null;

  useEffect(() => (twoPane ? requestFullWidth() : undefined), [twoPane, requestFullWidth]);

  // Hinge bounds are window-relative, so we need our own position in the window.
  const onLayout = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      setFrame((previous) =>
        previous &&
        previous.x === x &&
        previous.y === y &&
        previous.width === width &&
        previous.height === height
          ? previous
          : { x, y, width, height }
      );
    });
  }, []);

  if (!twoPane) {
    return <View style={[styles.fill, style]}>{primary}</View>;
  }

  const split = splitPanes(frame, hinge, ratio);

  return (
    <View
      ref={ref}
      onLayout={onLayout}
      style={[styles.fill, { flexDirection: split.direction }, style]}
    >
      <View style={split.primary}>{primary}</View>
      <View style={split.gap} />
      <View style={split.secondary}>{secondary}</View>
    </View>
  );
}

function splitPanes(frame: Frame | null, hinge: HingeBounds | null, ratio: number) {
  if (frame && hinge?.orientation === 'vertical') {
    const primaryWidth = Math.max(0, hinge.x - frame.x);
    return {
      direction: 'row' as const,
      primary: { width: primaryWidth },
      gap: { width: hinge.width },
      secondary: styles.fill,
    };
  }
  if (frame && hinge?.orientation === 'horizontal') {
    const primaryHeight = Math.max(0, hinge.y - frame.y);
    return {
      direction: 'column' as const,
      primary: { height: primaryHeight },
      gap: { height: hinge.height },
      secondary: styles.fill,
    };
  }
  return {
    direction: 'row' as const,
    primary: { flex: ratio },
    gap: null,
    secondary: { flex: 1 - ratio },
  };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { position: 'absolute' },
  fill: { flex: 1 },
});
