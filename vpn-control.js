document.addEventListener('DOMContentLoaded', () => {
    const vpnWidget   = document.getElementById('vpn-floating-widget');
    const vpnBtn      = document.getElementById('vpn-master-btn');
    const vpnSelector = document.getElementById('vpn-server-selector');
    const vpnLabel    = vpnWidget ? vpnWidget.querySelector('span:last-of-type') : null;

    if (!vpnWidget || !vpnBtn || !vpnSelector) return;

    const LS_KEY_CONNECTED = 'gfd_vpn_connected';
    const LS_KEY_SERVER    = 'gfd_vpn_server';
    const LS_KEY_CONFIG    = 'gfd_vpn_config';

    let isConnected = false;
    let statusListener = null;

    function setConnected(serverName) {
        isConnected = true; vpnBtn.disabled = false; vpnBtn.innerText = '연결됨 ✓';
        vpnBtn.style.setProperty('background-color', '#059669', 'important');
        vpnSelector.disabled = true;
        if (vpnLabel) vpnLabel.textContent = 'VPN 연결됨 · ' + serverName;
    }

    function setConnecting(serverName) {
        isConnected = false; vpnBtn.disabled = true; vpnBtn.innerText = '연결 중…';
        vpnBtn.style.setProperty('background-color', '#d97706', 'important');
        vpnSelector.disabled = true;
    }

    function setError(msg) {
        isConnected = false; vpnBtn.disabled = false; vpnBtn.innerText = '오류';
        vpnBtn.style.setProperty('background-color', '#dc2626', 'important');
        vpnSelector.disabled = false;
        if (vpnLabel) vpnLabel.textContent = 'VPN 오류: ' + msg;
    }

    function setIdle() {
        isConnected = false; vpnBtn.disabled = false; vpnBtn.innerText = '연결하기';
        vpnBtn.style.setProperty('background-color', '#dc2626', 'important');
        vpnSelector.disabled = false;
        if (vpnLabel) vpnLabel.textContent = 'GoldFireDragon VPN';
    }

    function saveState(connected, serverName, configFile) {
        localStorage.setItem(LS_KEY_CONNECTED, connected ? '1' : '0');
        if (serverName) localStorage.setItem(LS_KEY_SERVER, serverName);
        if (configFile) localStorage.setItem(LS_KEY_CONFIG, configFile);
    }

    function clearState() {
        localStorage.removeItem(LS_KEY_CONNECTED);
        localStorage.removeItem(LS_KEY_SERVER);
        localStorage.removeItem(LS_KEY_CONFIG);
    }

    function loadState() {
        return {
            connected: localStorage.getItem(LS_KEY_CONNECTED) === '1',
            server:    localStorage.getItem(LS_KEY_SERVER) || '',
            config:    localStorage.getItem(LS_KEY_CONFIG) || ''
        };
    }

    function init() {
        const saved = loadState();
        if (saved.connected) {
            setConnected(saved.server);
        } else {
            setIdle();
        }

        // Primary: native VpnService via Capacitor plugin
        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.GoldFireVpnPlugin) {
            const plugin = Capacitor.Plugins.GoldFireVpnPlugin;

            // Populate OVPN list from assets
            plugin.getOvpnList().then(result => {
                const files = Object.keys(result);
                if (files.length > 0) {
                    vpnSelector.innerHTML = '';
                    files.forEach(name => {
                        const opt = document.createElement('option');
                        opt.value = name;
                        const display = name.replace(/\.ovpn$/i, '');
                        opt.textContent = '🇯🇵 ' + display;
                        vpnSelector.appendChild(opt);
                    });
                    const s = loadState();
                    if (s.config && files.includes(s.config)) vpnSelector.value = s.config;
                }
            }).catch(() => {});

            // Listen for VPN status events from native service
            statusListener = plugin.addListener('vpnStatus', (data) => {
                const status = data.status || '';
                const saved = loadState();
                const serverName = saved.server || (vpnSelector.options[vpnSelector.selectedIndex] ? vpnSelector.options[vpnSelector.selectedIndex].text.replace('🇯🇵 ', '').trim() : '');

                if (status === 'CONNECTING' || status === 'STARTING' || status === 'CREATING_TUN') {
                    setConnecting(serverName);
                } else if (status === 'CONNECTED') {
                    setConnected(serverName);
                    saveState(true, serverName, saved.config || vpnSelector.value);
                } else if (status.startsWith('ERROR:')) {
                    setError(status.substring(6));
                    clearState();
                } else {
                    clearState();
                    setIdle();
                }
            });

            // Reconcile state with actual service status
            plugin.getStatus().then(result => {
                if (result.status !== 'CONNECTED') {
                    clearState();
                    setIdle();
                }
            }).catch(() => {});

        } else if (typeof front !== 'undefined' && front) {
            // Fallback: legacy Node.js Socket.IO path
            front.send('GET_OVPN_LIST');
            front.on('VPN_STATUS', (status) => {
                const saved = loadState();
                const serverName = saved.server || (vpnSelector.options[vpnSelector.selectedIndex] ? vpnSelector.options[vpnSelector.selectedIndex].text.replace('🇯🇵 ', '').trim() : '');
                if (status === 'CONNECTING') {
                    setConnecting(serverName);
                } else if (status === 'CONNECTED' || status === 'DISCONNECTED') {
                    if (status === 'CONNECTED') {
                        setConnected(serverName);
                        saveState(true, serverName, saved.config || vpnSelector.value);
                    } else {
                        clearState();
                        setIdle();
                    }
                }
            });
            front.on('OVPN_LIST_RESULT', (serverNames) => {
                vpnSelector.innerHTML = '';
                if (!serverNames || serverNames.length === 0) {
                    vpnSelector.innerHTML = '<option value="">❌ 없음</option>';
                    return;
                }
                serverNames.forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    const display = name.replace(/\.ovpn$/i, '');
                    opt.textContent = '🇯🇵 ' + display;
                    vpnSelector.appendChild(opt);
                });
                const s = loadState();
                if (s.config && serverNames.includes(s.config)) vpnSelector.value = s.config;
            });
        }
    }

    vpnBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        if (isConnected) {
            if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.GoldFireVpnPlugin) {
                Capacitor.Plugins.GoldFireVpnPlugin.stop();
            } else if (typeof front !== 'undefined' && front) {
                front.send('VPN_OFF');
            }
            clearState();
            setIdle();
            return;
        }

        const configFileName = vpnSelector.value;
        if (!configFileName) return;
        const serverName = vpnSelector.options[vpnSelector.selectedIndex].text.replace('🇯🇵 ', '').trim();
        setConnecting(serverName);
        saveState(true, serverName, configFileName);

        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.GoldFireVpnPlugin) {
            Capacitor.Plugins.GoldFireVpnPlugin.start({ configName: configFileName }).catch(err => {
                setError(err.message || 'Start failed');
                clearState();
            });
        } else if (typeof front !== 'undefined' && front) {
            front.send('START_JAPAN_VPN', configFileName);
        }
    });

    init();
});
