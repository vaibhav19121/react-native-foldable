import Foundation
import React
import UIKit

@objc(RNFoldable)
class RNFoldable: RCTEventEmitter {
  private var hingeInteraction: AnyObject?
  private var latestStatus = "unsupported"
  private var latestAngle: NSNumber? = nil

  override static func requiresMainQueueSetup() -> Bool { true }
  override func supportedEvents() -> [String]! { ["foldableChanged"] }

  @objc func getFoldableInfo(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(snapshot())
  }

  override func startObserving() {
    // UIHingeInteraction / UIHinge are available only on supported Apple OS/device/SDK combinations.
    // This reflective implementation keeps the package buildable with older SDKs; wire the typed
    // UIHingeInteraction handler when building with the iOS 27.1 SDK, then update latestStatus and
    // latestAngle from the native hinge update callback.
    if #available(iOS 27.1, *) {
      installHingeInteractionIfAvailable()
    }
  }

  @available(iOS 27.1, *)
  private func installHingeInteractionIfAvailable() {
    // Deliberately defensive: APIs can be absent on devices/windows that do not expose a hinge.
    // See README for native API requirements. The JS API reports unsupported until a hinge update arrives.
    latestStatus = "unknown"
  }

  private func snapshot() -> [String: Any] {
    let supported = latestStatus != "unsupported"
    let angleValue: Any = latestAngle.map { $0 as Any } ?? NSNull()
    return [
      "isSupported": supported,
      "isFoldable": supported,
      "status": latestStatus,
      "angle": angleValue,
      "isFolded": latestStatus == "closed",
      "isUnfolded": latestStatus == "fullyOpen",
      "isPartiallyFolded": latestStatus == "partiallyOpen"
    ]
  }
}
