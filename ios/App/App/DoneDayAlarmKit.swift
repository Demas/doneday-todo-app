#if canImport(AlarmKit)
import AlarmKit

// AlarmKit is isolated from the iOS 15 deployment target. A future Xcode build
// with the iOS/iPadOS 26 SDK may replace the notification fallback only after
// authorization, capability review, and real-device validation.
@available(iOS 26.0, *)
enum DoneDayAlarmKitAvailability {
    static let isEnabled = false
    static let reason = "AlarmKit integration requires Xcode, approved capability review, and device validation."
}
#endif
