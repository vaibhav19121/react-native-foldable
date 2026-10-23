import { useEffect, useState } from 'react';
import { NativeEventEmitter, Platform } from 'react-native';
import NativeFoldable from './NativeFoldable';
import type { FoldableInfo } from './types';
import { normalizeFoldableInfo, UNSUPPORTED_FOLDABLE_INFO } from './types';

const EVENT_NAME = 'foldableChanged';

const emitter = NativeFoldable ? new NativeEventEmitter(NativeFoldable as any) : null;

/** True when the native module is linked into the app binary. */
export const isFoldableNativeModuleAvailable = NativeFoldable != null && Platform.OS !== 'web';

/** Reads the current posture once. Resolves to an unsupported result if the native module is absent. */
export async function getFoldableInfo(): Promise<FoldableInfo> {
  if (!NativeFoldable) return UNSUPPORTED_FOLDABLE_INFO;
  try {
    return normalizeFoldableInfo(await NativeFoldable.getFoldableInfo());
  } catch {
    return UNSUPPORTED_FOLDABLE_INFO;
  }
}

/** Subscribes to posture/angle/hinge changes. Call `.remove()` on the result to unsubscribe. */
export function addFoldableListener(listener: (info: FoldableInfo) => void): { remove: () => void } {
  if (!emitter) return { remove: () => undefined };
  return emitter.addListener(EVENT_NAME, (event) => listener(normalizeFoldableInfo(event)));
}

/** React hook returning the current posture, updated live as the device folds. */
export function useFoldable(): FoldableInfo {
  const [info, setInfo] = useState<FoldableInfo>(UNSUPPORTED_FOLDABLE_INFO);

  useEffect(() => {
    let mounted = true;
    const subscription = addFoldableListener((next) => {
      if (mounted) setInfo(next);
    });
    getFoldableInfo().then((next) => {
      if (mounted) setInfo(next);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return info;
}
