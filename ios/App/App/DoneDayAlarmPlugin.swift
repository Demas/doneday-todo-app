import Capacitor
import UIKit
import UserNotifications

@objc(DoneDayAlarmPlugin)
public final class DoneDayAlarmPlugin: CAPPlugin, CAPBridgedPlugin, UNUserNotificationCenterDelegate {
    public let identifier = "DoneDayAlarmPlugin"
    public let jsName = "DoneDayAlarm"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncAlarms", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "testAlarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dismissAlarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "snoozeAlarm", returnType: CAPPluginReturnPromise)
    ]

    private static let storageKey = "doneday.ios.alarm.definitions.v1"
    private static let category = "DONE_DAY_ALARM"
    private static let stop = "DONE_DAY_ALARM_STOP"
    private static let snooze = "DONE_DAY_ALARM_SNOOZE"
    private let center = UNUserNotificationCenter.current()

    public override func load() {
        center.delegate = self
        let stop = UNNotificationAction(identifier: Self.stop, title: "Stop", options: [.destructive])
        let snooze = UNNotificationAction(identifier: Self.snooze, title: "Snooze", options: [])
        center.setNotificationCategories([UNNotificationCategory(identifier: Self.category, actions: [stop, snooze], intentIdentifiers: [], options: [])])
        NotificationCenter.default.addObserver(self, selector: #selector(timezoneChanged), name: UIApplication.significantTimeChangeNotification, object: nil)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    @objc func getCapabilities(_ call: CAPPluginCall) {
        center.getNotificationSettings { [weak self] settings in call.resolve(self?.capabilities(settings) ?? [:]) }
    }

    @objc func requestPermissions(_ call: CAPPluginCall) {
        center.requestAuthorization(options: [.alert, .badge, .sound]) { [weak self] _, error in
            self?.center.getNotificationSettings { settings in
                if let error { call.reject("DoneDay could not request iPhone notification permission.", nil, error) }
                else { call.resolve(self?.capabilities(settings) ?? [:]) }
            }
        }
    }

    @objc func syncAlarms(_ call: CAPPluginCall) {
        guard let objects = call.getArray("alarms", JSObject.self) else { call.reject("DoneDay needs an alarms array."); return }
        do {
            let alarms = try objects.map(IOSAlarm.init)
            guard Set(alarms.map(\.id)).count == alarms.count else { throw AlarmError.invalid("Each alarm needs a unique stable identity.") }
            replace(alarms) { result in
                switch result {
                case .success: call.resolve()
                case .failure(let error): call.reject(error.localizedDescription)
                }
            }
        } catch { call.reject(error.localizedDescription) }
    }

    @objc func testAlarm(_ call: CAPPluginCall) {
        do {
            let alarm = try IOSAlarm(object: call.options)
            let request = UNNotificationRequest(identifier: "\(prefix(alarm.id)).test.\(UUID().uuidString)", content: content(alarm), trigger: UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false))
            center.add(request) { error in
                if let error { call.reject("DoneDay could not schedule the iPhone test notification.", nil, error) }
                else { call.resolve() }
            }
        } catch { call.reject(error.localizedDescription) }
    }

    @objc func dismissAlarm(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else { call.reject("DoneDay needs an alarm identity to stop."); return }
        cancel(id)
        call.resolve()
    }

    @objc func snoozeAlarm(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let alarm = stored().first(where: { $0.id == id }) else { call.reject("This alarm is no longer available to snooze."); return }
        snooze(alarm) { error in
            if let error { call.reject("DoneDay could not schedule the snooze.", nil, error) }
            else { call.resolve() }
        }
    }

    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completion: @escaping (UNNotificationPresentationOptions) -> Void) {
        emitDue(notification.request.content)
        completion([.banner, .list, .sound])
    }

    public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completion: @escaping () -> Void) {
        let content = response.notification.request.content
        guard let id = content.userInfo["donedayAlarmId"] as? String else { completion(); return }
        if response.actionIdentifier == Self.stop {
            cancel(id)
        } else if response.actionIdentifier == Self.snooze, let alarm = stored().first(where: { $0.id == id }) {
            snooze(alarm) { _ in }
        } else {
            emitDue(content)
        }
        completion()
    }

    @objc private func timezoneChanged() {
        // Fixed-zone components retain their IANA timezone; follow-device
        // components are rebuilt after a significant system time/timezone change.
        replace(stored(), removeStale: false) { _ in }
    }

    private func capabilities(_ settings: UNNotificationSettings) -> JSObject {
        let permission: String
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: permission = "granted"
        case .denied: permission = "denied"
        case .notDetermined: permission = "prompt"
        @unknown default: permission = "unavailable"
        }
        var alarmKitAvailable = false
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) { alarmKitAvailable = DoneDayAlarmKitAvailability.isEnabled }
        #endif
        return ["platform": "ios", "smartAlarms": true, "exactAlarms": false, "fullScreenIntents": false, "notificationPermission": permission, "alarmKitAvailable": alarmKitAvailable, "message": "iPhone schedules local notification reminders with Stop and Snooze actions. iOS 15–18 cannot keep a DoneDay alarm ringing after the app is closed."]
    }

    private func replace(_ alarms: [IOSAlarm], removeStale: Bool = true, completion: @escaping (Result<Void, Error>) -> Void) {
        let previous = stored()
        let newIDs = alarms.flatMap(requestIDs)
        let group = DispatchGroup()
        let state = FailureState()
        for alarm in alarms {
            group.enter()
            schedule(alarm) { result in state.record(result); group.leave() }
        }
        group.notify(queue: .main) {
            if let error = state.error {
                // Never delete an existing schedule after a failed replacement.
                completion(.failure(error))
                return
            }
            if removeStale {
                let stale = Set(previous.flatMap(self.requestIDs)).subtracting(newIDs)
                self.center.removePendingNotificationRequests(withIdentifiers: Array(stale))
                self.center.removeDeliveredNotifications(withIdentifiers: Array(stale))
            }
            self.save(alarms)
            completion(.success(()))
        }
    }

    private func schedule(_ alarm: IOSAlarm, completion: @escaping (Result<Void, Error>) -> Void) {
        do {
            let requests = try requests(alarm)
            let group = DispatchGroup()
            let state = FailureState()
            for request in requests {
                group.enter()
                center.add(request) { error in
                    if let error {
                        state.record(.failure(error))
                    } else {
                        state.record(.success(()))
                    }
                    group.leave()
                }
            }
            group.notify(queue: .main) { completion(state.error.map(Result.failure) ?? .success(())) }
        } catch { completion(.failure(error)) }
    }

    private func requests(_ alarm: IOSAlarm) throws -> [UNNotificationRequest] {
        try components(alarm).enumerated().map { index, component in
            let suffix = component.weekday.map { "weekday-\($0)" } ?? (alarm.recurrence == "none" ? "once" : "repeat-\(index)")
            return UNNotificationRequest(identifier: "\(prefix(alarm.id)).\(suffix)", content: content(alarm), trigger: UNCalendarNotificationTrigger(dateMatching: component, repeats: alarm.recurrence != "none"))
        }
    }

    private func content(_ alarm: IOSAlarm) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = alarm.title
        content.body = alarm.body
        content.sound = .default
        content.categoryIdentifier = Self.category
        content.threadIdentifier = "doneday.alarm.\(alarm.id)"
        content.userInfo = ["donedayAlarmId": alarm.id, "snoozeMinutes": alarm.snoozeMinutes]
        return content
    }

    private func components(_ alarm: IOSAlarm) throws -> [DateComponents] {
        let date = try alarm.date()
        let time = try alarm.time()
        let zone = try alarm.zone()
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "en_US_POSIX")
        calendar.timeZone = zone
        func base() -> DateComponents {
            var value = DateComponents()
            value.calendar = calendar
            if alarm.timezoneMode == "fixed" { value.timeZone = zone }
            value.hour = time.0; value.minute = time.1
            return value
        }
        if alarm.recurrence == "none" {
            var value = base()
            value.year = date.0; value.month = date.1; value.day = date.2
            // Shared DST behavior: move gaps forward and select the first fold.
            guard let next = calendar.nextDate(after: Date().addingTimeInterval(-1), matching: value, matchingPolicy: .nextTime, repeatedTimePolicy: .first, direction: .forward) else { throw AlarmError.invalid("This alarm time has already passed or cannot be resolved.") }
            var resolved = calendar.dateComponents([.calendar, .timeZone, .year, .month, .day, .hour, .minute], from: next)
            if alarm.timezoneMode == "follow-device" { resolved.timeZone = nil }
            return [resolved]
        }
        switch alarm.recurrence {
        case "daily": return [base()]
        case "weekdays": return (2...6).map { day in var value = base(); value.weekday = day; return value }
        case "weekly":
            var value = base()
            guard let anchor = calendar.date(from: DateComponents(calendar: calendar, timeZone: zone, year: date.0, month: date.1, day: date.2, hour: time.0, minute: time.1)) else { throw AlarmError.invalid("DoneDay could not resolve the weekly alarm date.") }
            value.weekday = calendar.component(.weekday, from: anchor)
            return [value]
        case "selected-days":
            let days = Set(alarm.recurrenceDays).filter { (0...6).contains($0) }.sorted()
            guard !days.isEmpty else { throw AlarmError.invalid("Choose at least one day for this recurring alarm.") }
            return days.map { day in var value = base(); value.weekday = day + 1; return value }
        case "monthly": var value = base(); value.day = date.2; return [value]
        case "annual": var value = base(); value.month = date.1; value.day = date.2; return [value]
        default: throw AlarmError.invalid("DoneDay does not recognize this alarm recurrence.")
        }
    }

    private func requestIDs(_ alarm: IOSAlarm) -> [String] {
        let base = prefix(alarm.id)
        if alarm.recurrence == "weekdays" { return (2...6).map { "\(base).weekday-\($0)" } }
        if alarm.recurrence == "selected-days" { return Set(alarm.recurrenceDays).filter { (0...6).contains($0) }.sorted().map { "\(base).weekday-\($0 + 1)" } }
        return [alarm.recurrence == "none" ? "\(base).once" : "\(base).repeat-0"]
    }
    private func prefix(_ id: String) -> String { "doneday.alarm.\(id)" }
    private func cancel(_ id: String) {
        let saved = stored().first(where: { $0.id == id })
        let ids = saved.map(requestIDs) ?? ["\(prefix(id)).once"]
        center.removePendingNotificationRequests(withIdentifiers: ids + ["\(prefix(id)).snooze"])
        center.removeDeliveredNotifications(withIdentifiers: ids + ["\(prefix(id)).snooze"])
    }
    private func snooze(_ alarm: IOSAlarm, completion: @escaping (Error?) -> Void) {
        center.add(UNNotificationRequest(identifier: "\(prefix(alarm.id)).snooze", content: content(alarm), trigger: UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(alarm.snoozeMinutes * 60), repeats: false)), withCompletionHandler: completion)
    }
    private func emitDue(_ content: UNNotificationContent) {
        guard let id = content.userInfo["donedayAlarmId"] as? String else { return }
        notifyListeners("alarmDue", data: ["id": id, "title": content.title, "body": content.body, "snoozeMinutes": content.userInfo["snoozeMinutes"] as? Int ?? 10])
    }
    private func stored() -> [IOSAlarm] { guard let data = UserDefaults.standard.data(forKey: Self.storageKey) else { return [] }; return (try? JSONDecoder().decode([IOSAlarm].self, from: data)) ?? [] }
    private func save(_ alarms: [IOSAlarm]) { if let data = try? JSONEncoder().encode(alarms) { UserDefaults.standard.set(data, forKey: Self.storageKey) } }
}

private final class FailureState {
    private let lock = NSLock()
    private(set) var error: Error?
    func record(_ result: Result<Void, Error>) { guard case .failure(let next) = result else { return }; lock.lock(); if error == nil { error = next }; lock.unlock() }
}
private enum AlarmError: LocalizedError { case invalid(String); var errorDescription: String? { if case .invalid(let message) = self { return message }; return nil } }

private struct IOSAlarm: Codable {
    let id, reminderId, localDate, localTime, timezone, timezoneMode, recurrence, title, body, ringtone: String
    let version, scheduleRevision, snoozeMinutes: Int
    let recurrenceDays: [Int]
    let vibrate: Bool
    init(object: JSObject) throws {
        guard let id = object["id"] as? String, let reminderId = object["reminderId"] as? String, id == reminderId,
              let localDate = object["localDate"] as? String, let localTime = object["localTime"] as? String,
              let timezone = object["timezone"] as? String, let timezoneMode = object["timezoneMode"] as? String,
              let recurrence = object["recurrence"] as? String, let title = object["title"] as? String, let body = object["body"] as? String else { throw AlarmError.invalid("DoneDay received an incomplete native alarm definition.") }
        let version = (object["version"] as? NSNumber)?.intValue ?? -1
        let scheduleRevision = (object["scheduleRevision"] as? NSNumber)?.intValue ?? 0
        let snoozeMinutes = (object["snoozeMinutes"] as? NSNumber)?.intValue ?? 10
        let recurrenceDays = (object["recurrenceDays"] as? [NSNumber])?.map(\.intValue) ?? []
        guard version == 1, scheduleRevision >= 1, !id.isEmpty, ["fixed", "follow-device"].contains(timezoneMode), ["none", "daily", "weekdays", "weekly", "monthly", "selected-days", "annual"].contains(recurrence), TimeZone.knownTimeZoneIdentifiers.contains(timezone) else { throw AlarmError.invalid("DoneDay requires a valid versioned alarm definition and IANA timezone.") }
        self.id = id; self.reminderId = reminderId; self.localDate = localDate; self.localTime = localTime; self.timezone = timezone; self.timezoneMode = timezoneMode; self.recurrence = recurrence; self.title = title; self.body = body; self.ringtone = (object["ringtone"] as? String) ?? "alarm"; self.version = version; self.scheduleRevision = scheduleRevision; self.snoozeMinutes = [5,10,15,30].contains(snoozeMinutes) ? snoozeMinutes : 10; self.recurrenceDays = recurrenceDays; self.vibrate = (object["vibrate"] as? Bool) ?? true
        _ = try date(); _ = try time()
    }
    func zone() throws -> TimeZone { guard let zone = timezoneMode == "follow-device" ? TimeZone.current : TimeZone(identifier: timezone) else { throw AlarmError.invalid("DoneDay could not resolve this alarm timezone.") }; return zone }
    func date() throws -> (Int, Int, Int) { let parts = localDate.split(separator: "-").compactMap { Int($0) }; guard parts.count == 3, let date = Calendar(identifier: .gregorian).date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])), Calendar(identifier: .gregorian).component(.month, from: date) == parts[1], Calendar(identifier: .gregorian).component(.day, from: date) == parts[2] else { throw AlarmError.invalid("DoneDay received an invalid local alarm date.") }; return (parts[0], parts[1], parts[2]) }
    func time() throws -> (Int, Int) { let parts = localTime.split(separator: ":").compactMap { Int($0) }; guard parts.count == 2, (0...23).contains(parts[0]), (0...59).contains(parts[1]) else { throw AlarmError.invalid("DoneDay received an invalid local alarm time.") }; return (parts[0], parts[1]) }
}
