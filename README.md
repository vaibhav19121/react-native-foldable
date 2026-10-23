# react-native-foldable

Fold posture, hinge angle and hinge bounds for React Native on foldable devices (Galaxy Z Fold/Flip, Pixel Fold, etc.).

New Architecture (TurboModule) only — React Native 0.76+.

## Install

```sh
yarn add file:./react-native-foldable   # or the published package name
cd ios && pod install && cd ..
```

Rebuild the app afterwards; autolinking handles the rest.

## Usage

```tsx
import { useFoldable } from 'react-native-foldable';

function Screen() {
  const { isSupported, status, angle, hinge, isPartiallyFolded } = useFoldable();

  if (hinge?.isSeparating && hinge.orientation === 'vertical') {
    // Book mode: render two panes either side of hinge.x
  }
  // ...
}
```

One-off read and manual subscription:

```ts
import { getFoldableInfo, addFoldableListener } from 'react-native-foldable';

const info = await getFoldableInfo();
const sub = addFoldableListener((info) => console.log(info.status, info.angle));
sub.remove();
```

## Automatic layout: `<FoldableLayout>`

Wrap the app root once and existing phone-designed screens adapt without changes:

```tsx
import { FoldableLayout } from 'react-native-foldable';

<FoldableLayout backgroundColor="#F7F7F9">
  <App />
</FoldableLayout>
```

| Situation | What happens |
| --- | --- |
| Phone / folded | Nothing — full width |
| Unfolded flat, wide screen | Full screen (or kept to `maxWidth`, centered, if you set it) |
| Book mode (half-open, vertical fold) | Content moved to the larger side of the fold |
| Hinge that hides pixels (dual-screen) | Content kept off the hinge |
| Tabletop (horizontal fold, nothing hidden) | Full screen (`maxWidth` applies if set) |

Props: `maxWidth` (default: no limit — e.g. `600` for a phone-like centered column), `avoidHinge` (default `true`), `backgroundColor` (fills the space beside the content), `style`.

React state is preserved across fold/unfold — screens are re-laid out, not remounted.

Not covered (render outside the wrapper): React Native `<Modal>`, and anything sized from `Dimensions.get()` read once at startup — read sizes with `useWindowDimensions()` or `useFoldableLayout().content` instead.

### Opt-in: `<DualPane>`

```tsx
import { DualPane } from 'react-native-foldable';
import { useIsFocused } from '@react-navigation/native';

<DualPane
  enabled={useIsFocused()}
  primary={<OrderList onSelect={setOrder} />}
  secondary={order && <OrderDetail order={order} />}
/>
```

Splits exactly at the hinge in book/tabletop posture, by `ratio` (default 0.4) on wide screens, and shows only `primary` on narrow screens. While two panes are shown, any `maxWidth` limit is lifted. Pass `enabled={useIsFocused()}` so a DualPane on a screen lower in the navigation stack doesn't keep the app full-width.

### Adaptive tab bar: `useAdaptiveTabBarPosition()`

Moves a React Navigation (v7+) bottom tab bar to a vertical side rail when the device is open (same rule as `DualPane`: window ≥ `minWidth` or a separating hinge), and back to the bottom when folded.

```tsx
import { useAdaptiveTabBarPosition } from 'react-native-foldable';

function Tabs() {
  const tabBarPosition = useAdaptiveTabBarPosition({ side: 'left' }); // or 'right'
  return <Tab.Navigator screenOptions={{ tabBarPosition }}>{/* ... */}</Tab.Navigator>;
}
```

The default tab bar handles the side position itself. For a custom tab bar, use `AdaptiveTabBar` instead.

### Floating side rail: `<AdaptiveTabBar>`

A drop-in `tabBar` that keeps your existing bottom bar on phones / folded devices and shows a floating, icon-only pill on the side when the device is open. Your bottom bar needs no changes.

```tsx
<Tab.Navigator
  tabBar={(props) => (
    <AdaptiveTabBar
      {...props}
      side="left"            // 'left' | 'right'
      align="center"         // 'top' | 'center' | 'bottom'
      renderBottomBar={() => <MyBottomBar {...props} />}
    />
  )}
>
```

| Prop | Default | Purpose |
| --- | --- | --- |
| `renderBottomBar` | – | Bar shown when folded / on phones |
| `side` / `align` | `'left'` / `'center'` | Rail placement |
| `minWidth` | `600` | Width at which the rail replaces the bottom bar |
| `renderIcon(route, { focused, color, size })` | screen's `tabBarIcon` | Rail icons |
| `getAccessibilityLabel(route)` | `tabBarAccessibilityLabel` → `title` → route name | Screen-reader label |
| `isRouteHidden(route, state)` | – | Hide tabs from the rail |
| `onTabPress(route, open)` | switches tab | Intercept presses (e.g. sign-in gate); call `open()` to proceed |
| `colors` | dark glass | `background`, `border`, `activeBackground`, `activeTint`, `inactiveTint`, `badge`, `badgeText` |
| `edgeGap` | `12` | Gap from screen edge / safe-area |

It emits the standard `tabPress` event, honours `tabBarBadge`, and hides itself when the focused screen sets `tabBarStyle: { display: 'none' }`.

**Reserve space for the rail** (recommended) by also passing `useAdaptiveTabBarPosition()` to the navigator. The rail then gets its own column and screens sit beside it instead of underneath; the side comes from the hook:

```tsx
const tabBarPosition = useAdaptiveTabBarPosition({ side: 'left' });

<Tab.Navigator
  screenOptions={{ tabBarPosition }}
  tabBar={(props) => <AdaptiveTabBar {...props} align="top" renderBottomBar={() => <MyBottomBar {...props} />} />}
>
```

Without it the rail floats over the screens on `side`.

### Hooks

- `useFoldableLayout()` → `{ info, window, content, screenClass }` — `content` is the frame the app is laid out in.
- `useScreenClass()` → `'compact' | 'medium' | 'expanded'` (Material breakpoints 600 / 840dp, from the full window width).

## `FoldableInfo`

| Field | Type | Notes |
| --- | --- | --- |
| `isSupported` | `boolean` | Device has a hinge sensor or has reported a folding feature |
| `status` | `'closed' \| 'partiallyOpen' \| 'fullyOpen' \| 'unknown' \| 'unsupported'` | Derived from the hinge angle when available, otherwise from the window posture |
| `angle` | `number \| null` | Degrees, 0 = closed, 180 = flat. Null without a hinge sensor |
| `hinge` | `HingeBounds \| null` | Fold position in dp, only while the app window spans the fold |
| `isFolded` / `isPartiallyFolded` / `isUnfolded` | `boolean` | Shorthands for `status` |

Angle thresholds: `<= 10°` closed, `>= 170°` fully open.

## Platform notes

- **Android** combines `Sensor.TYPE_HINGE_ANGLE` (API 30+, works on the cover screen) with Jetpack WindowManager `FoldingFeature` (posture + bounds, only while the window spans the fold). Sensors are unregistered while the app is in the background.
- **iOS** (iPhone Duo, iOS 27.1+) uses `UIHingeInteraction` on the key window for `status` and `angle`. Build with Xcode 27.1 or newer — older SDKs compile the fallback that reports `unsupported`. `hinge` bounds are always `null` on iOS; Apple exposes fold placement via reserved regions instead. Non-foldable iPhones report `unsupported`.
- Behaviour varies by manufacturer — test on a real device or the Android Studio foldable emulator.
