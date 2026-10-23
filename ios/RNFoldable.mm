#import "RNFoldable.h"

#import <UIKit/UIKit.h>

// UIHingeInteraction (iOS 27.1+, e.g. iPhone Duo) reports hinge status and angle for the
// view hierarchy it is attached to. We attach it to the app's key window and re-attach
// whenever the app becomes active, since the window may not exist when the module loads.
// Compiling with an older SDK falls back to "unsupported".
#if defined(__IPHONE_OS_VERSION_MAX_ALLOWED) && __IPHONE_OS_VERSION_MAX_ALLOWED >= 270100
#define RNF_HAS_HINGE_SDK 1
#else
#define RNF_HAS_HINGE_SDK 0
#endif

@implementation RNFoldable {
  BOOL _hasListeners;
  BOOL _isSupported;
  NSString *_status;
  NSNumber *_angle;
  __weak UIWindow *_trackedWindow;
  id<UIInteraction> _interaction;
}

RCT_EXPORT_MODULE(RNFoldable)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if (self = [super init]) {
    _status = @"unsupported";
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(attachToKeyWindow)
                                                 name:UIApplicationDidBecomeActiveNotification
                                               object:nil];
    dispatch_async(dispatch_get_main_queue(), ^{
      [self attachToKeyWindow];
    });
  }
  return self;
}

- (void)invalidate
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
  dispatch_async(dispatch_get_main_queue(), ^{
    [self detach];
  });
  [super invalidate];
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ @"foldableChanged" ];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

#pragma mark - Hinge tracking (main thread)

- (UIWindow *)keyWindow
{
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) continue;
    UIWindowScene *windowScene = (UIWindowScene *)scene;
    if (windowScene.keyWindow) return windowScene.keyWindow;
  }
  return nil;
}

- (void)attachToKeyWindow
{
#if RNF_HAS_HINGE_SDK
  if (@available(iOS 27.1, *)) {
    UIWindow *window = [self keyWindow];
    if (window == nil || window == _trackedWindow) return;
    [self detach];

    __weak RNFoldable *weakSelf = self;
    UIHingeInteraction *interaction =
        [[UIHingeInteraction alloc] initWithUpdateHandler:^(UIHingeInteraction *_, UIHingeInteractionUpdate *update) {
          [weakSelf handleHinge:update.hinge];
        }];
    [window addInteraction:interaction];
    _interaction = interaction;
    _trackedWindow = window;
  }
#endif
}

- (void)detach
{
  if (_interaction != nil) {
    [_trackedWindow removeInteraction:_interaction];
  }
  _interaction = nil;
  _trackedWindow = nil;
}

#if RNF_HAS_HINGE_SDK
- (void)handleHinge:(UIHinge *)hinge API_AVAILABLE(ios(27.1))
{
  @synchronized(self) {
    if (hinge == nil) {
      // The hierarchy provides no hinge updates: not a foldable device.
      _isSupported = NO;
      _status = @"unsupported";
      _angle = nil;
    } else {
      _isSupported = YES;
      switch (hinge.status) {
        case UIHingeStatusClosed:
          _status = @"closed";
          break;
        case UIHingeStatusPartiallyOpen:
          _status = @"partiallyOpen";
          break;
        case UIHingeStatusFullyOpen:
          _status = @"fullyOpen";
          break;
        default:
          _status = @"unknown";
          break;
      }
      // UIHinge.angle is in radians; the JS API uses degrees.
      _angle = @(hinge.angle * 180.0 / M_PI);
    }
  }

  if (_hasListeners) {
    [self sendEventWithName:@"foldableChanged" body:[self snapshot]];
  }
}
#endif

- (NSDictionary *)snapshot
{
  @synchronized(self) {
    return @{
      @"isSupported" : @(_isSupported),
      @"status" : _status,
      @"angle" : _angle ?: (id)[NSNull null],
      // iOS exposes fold placement through reserved regions, not hinge bounds.
      @"hinge" : [NSNull null],
    };
  }
}

#pragma mark - NativeFoldableSpec

- (void)getFoldableInfo:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  resolve([self snapshot]);
}

- (void)addListener:(NSString *)eventName
{
  [super addListener:eventName];
}

- (void)removeListeners:(double)count
{
  [super removeListeners:count];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeFoldableSpecJSI>(params);
}

@end
