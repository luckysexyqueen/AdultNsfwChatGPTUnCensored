// GoldFireDragon Native VPN Bridge Engine
// vpn-control.js 통합본에서 직접 사용 — 이 파일은 레거시 참조용
window.vpnBridge = {
    getStatus() {
        if (window.jpvpn_ch) return window.jpvpn_ch.getVpnStatus();
        return 'disconnected';
    },
    connect(configFileName, serverName) {
        if (window.jpvpn_ch) {
            const fullPath = 'file:///android_asset/www/japan/Configs/'.ovpn;
            window.jpvpn_ch.connectVpn(fullPath, serverName);
            return true;
        }
        return false;
    },
    disconnect() {
        if (window.jpvpn_ch) { window.jpvpn_ch.disconnectVpn(); return true; }
        return false;
    }
};
