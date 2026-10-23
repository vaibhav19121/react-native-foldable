import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDualPaneActive } from './FoldableLayout';

// Structural subset of React Navigation's BottomTabBarProps, so the package
// doesn't depend on @react-navigation/bottom-tabs.
export type TabRoute = { key: string; name: string; params?: object };

export type TabBarState = { index: number; routes: TabRoute[] };

export type TabBarProps = {
  state: TabBarState;
  descriptors: Record<string, { options: Record<string, any> }>;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (...args: any[]) => void;
  };
  insets?: { top: number; right: number; bottom: number; left: number };
};

export type TabIconProps = { focused: boolean; color: string; size: number };

export type TabRailColors = {
  /** Behind the rail's own column (only when the navigator reserves space for it). */
  columnBackground: string;
  /** The pill itself. */
  background: string;
  border: string;
  activeBackground: string;
  activeTint: string;
  inactiveTint: string;
  badge: string;
  badgeText: string;
};

export type AdaptiveTabBarProps = TabBarProps & {
  /** The bar shown on phones / folded devices, e.g. your existing custom tab bar. */
  renderBottomBar?: (props: TabBarProps) => ReactNode;
  /**
   * Side the rail floats on when the navigator keeps `tabBarPosition: 'bottom'`. Default 'left'.
   * With `useAdaptiveTabBarPosition` the navigator's position is used and space is reserved instead.
   */
  side?: 'left' | 'right';
  /** Vertical placement of the rail. Default 'center'. */
  align?: 'top' | 'center' | 'bottom';
  /** Window width at which the rail replaces the bottom bar (same rule as DualPane). Default 600. */
  minWidth?: number;
  /** Rail icon. Falls back to the screen's `tabBarIcon` option. */
  renderIcon?: (route: TabRoute, props: TabIconProps) => ReactNode;
  /** Screen-reader label. Falls back to `tabBarAccessibilityLabel`, then `title`, then the route name. */
  getAccessibilityLabel?: (route: TabRoute) => string | undefined;
  /** Hide individual tabs from the rail. */
  isRouteHidden?: (route: TabRoute, state: TabBarState) => boolean;
  /** Intercept a rail press (e.g. require sign-in); call `open()` to switch tabs. */
  onTabPress?: (route: TabRoute, open: () => void) => void;
  colors?: Partial<TabRailColors>;
  /** Distance from the screen edge and safe-area insets. Default 12. */
  edgeGap?: number;
};

const DEFAULT_COLORS: TabRailColors = {
  columnBackground: 'transparent',
  background: 'rgba(28, 28, 30, 0.72)',
  border: 'rgba(255, 255, 255, 0.18)',
  activeBackground: '#ffffff',
  activeTint: '#000000',
  inactiveTint: 'rgba(255, 255, 255, 0.85)',
  badge: '#ff3b30',
  badgeText: '#ffffff',
};

const ALIGN_TO_JUSTIFY = {
  top: 'flex-start',
  center: 'center',
  bottom: 'flex-end',
} as const;

const ICON_SIZE = 22;

/**
 * Drop-in `tabBar` for React Navigation bottom tabs: renders `renderBottomBar`
 * on phones / folded devices and a floating vertical pill when the device is open.
 */
export function AdaptiveTabBar(props: AdaptiveTabBarProps) {
  const {
    state,
    descriptors,
    navigation,
    insets,
    renderBottomBar,
    side = 'left',
    align = 'center',
    minWidth,
    renderIcon,
    getAccessibilityLabel,
    isRouteHidden,
    onTabPress,
    colors: colorOverrides,
    edgeGap = 12,
  } = props;

  const isOpen = useDualPaneActive(minWidth);

  const focusedOptions = descriptors[state.routes[state.index].key]?.options ?? {};
  // When the navigator itself puts the bar on the side (tabBarPosition from
  // useAdaptiveTabBarPosition), the rail gets its own column and screens sit
  // beside it. Otherwise it can only float over the screens.
  const navigatorSide: 'left' | 'right' | null =
    focusedOptions.tabBarPosition === 'left' || focusedOptions.tabBarPosition === 'right'
      ? focusedOptions.tabBarPosition
      : null;

  if (!navigatorSide && !isOpen) {
    return renderBottomBar ? <>{renderBottomBar({ state, descriptors, navigation, insets })}</> : null;
  }
  if (focusedOptions.tabBarStyle?.display === 'none') return null;

  const colors = { ...DEFAULT_COLORS, ...colorOverrides };
  const safe = insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const railSide = navigatorSide ?? side;
  const justifyContent = ALIGN_TO_JUSTIFY[align];

  const containerStyle = navigatorSide
    ? [
        styles.column,
        {
          backgroundColor: colors.columnBackground,
          paddingTop: edgeGap + safe.top,
          paddingBottom: edgeGap + safe.bottom,
          paddingLeft: edgeGap + (railSide === 'left' ? safe.left : 0),
          paddingRight: edgeGap + (railSide === 'right' ? safe.right : 0),
          justifyContent,
        },
      ]
    : [
        styles.overlay,
        railSide === 'left' ? { left: edgeGap + safe.left } : { right: edgeGap + safe.right },
        { top: edgeGap + safe.top, bottom: edgeGap + safe.bottom, justifyContent },
      ];

  return (
    <View pointerEvents="box-none" style={containerStyle}>
      <View style={[styles.pill, { backgroundColor: colors.background, borderColor: colors.border }]}>
        {state.routes.map((route, index) => {
          if (isRouteHidden?.(route, state)) return null;

          const options = descriptors[route.key]?.options ?? {};
          const focused = state.index === index;
          const color = focused ? colors.activeTint : colors.inactiveTint;
          const icon = renderIcon
            ? renderIcon(route, { focused, color, size: ICON_SIZE })
            : options.tabBarIcon?.({ focused, color, size: ICON_SIZE });
          const badge = options.tabBarBadge;
          const label =
            getAccessibilityLabel?.(route) ?? options.tabBarAccessibilityLabel ?? options.title ?? route.name;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (focused || event.defaultPrevented) return;
            const open = () => navigation.navigate(route.name, route.params);
            if (onTabPress) onTabPress(route, open);
            else open();
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              style={({ pressed }) => [
                styles.item,
                focused && { backgroundColor: colors.activeBackground },
                pressed && styles.pressed,
              ]}
            >
              <View>
                {icon}
                {badge != null && (
                  <View style={[styles.badge, { backgroundColor: colors.badge }]}>
                    <Text style={[styles.badgeText, { color: colors.badgeText }]}>{badge}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    zIndex: 10,
  },
  column: {
    alignItems: 'center',
  },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 10,
    borderRadius: 32,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    shadowOpacity: 0.3,
    elevation: 10,
  },
  item: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    lineHeight: 12,
  },
});
