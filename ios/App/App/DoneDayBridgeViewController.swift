import Capacitor

final class DoneDayBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DoneDayAlarmPlugin())
    }
}
