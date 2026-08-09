/**
 * 360 VR Browser & Video Player with Oculus Eye Tracking & Controller Support
 * Supports: Oculus Quest (Eye Tracking + Controllers), Mobile (Touch), Desktop (Mouse)
 */

(function() {
    if (window.__VR_360_ENHANCED__) return;
    window.__VR_360_ENHANCED__ = true;

    console.log("🥽 360 VR Enhanced Patch Loading...");

    // Load Three.js
    const loadThreeJS = () => {
        return new Promise((resolve) => {
            if (window.THREE) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
            script.onload = resolve;
            document.head.appendChild(script);
        });
    };

    // VR State Management
    const vrState = {
        isActive: false,
        mode: 'desktop',
        scene: null,
        camera: null,
        renderer: null,
        sphere: null,
        videoElement: null,
        rotation: { lon: 0, lat: 0 },
        isUserInteracting: false,
        pointerStart: { x: 0, y: 0 },
        xrSession: null,
        eyeTracking: null
    };

    // Detect Device Type
    const detectDevice = () => {
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('oculus') || ua.includes('quest')) {
            vrState.mode = 'oculus';
            console.log("📱 Oculus Device Detected");
        } else if (ua.includes('mobile') || ua.includes('android')) {
            vrState.mode = 'mobile';
            console.log("📱 Mobile Device Detected");
        } else {
            vrState.mode = 'desktop';
            console.log("🖥️ Desktop Device Detected");
        }
    };

    // Initialize WebXR for Oculus
    const initWebXR = async () => {
        if (!navigator.xr) {
            console.warn("WebXR not available");
            return;
        }

        try {
            const supported = await navigator.xr.isSessionSupported('immersive-vr');
            if (supported) {
                console.log("✅ WebXR immersive-vr supported");
                
                const vrBtn = document.createElement('button');
                vrBtn.innerHTML = '🥽 ENTER VR';
                vrBtn.style.cssText = `
                    position: fixed; bottom: 70px; right: 20px; z-index: 99999;
                    padding: 12px 20px; background: rgba(0,0,0,0.8); color: white;
                    border: 2px solid #00ff00; border-radius: 8px; font-weight: bold;
                    cursor: pointer; font-size: 14px;
                `;
                vrBtn.onclick = async () => {
                    try {
                        vrState.xrSession = await navigator.xr.requestSession('immersive-vr', {
                            requiredFeatures: ['local'],
                            optionalFeatures: ['eye-tracking', 'dom-overlay'],
                            domOverlay: { root: document.body }
                        });
                        console.log("✅ VR Session Started");
                        vrBtn.innerHTML = '🥽 EXIT VR';
                        vrBtn.onclick = () => {
                            vrState.xrSession.end();
                            vrBtn.innerHTML = '🥽 ENTER VR';
                        };
                    } catch (e) {
                        console.error("VR Session Error:", e);
                    }
                };
                document.body.appendChild(vrBtn);
            }
        } catch (e) {
            console.warn("WebXR check failed:", e);
        }
    };

    // Initialize 360 View
    const init360View = async () => {
        await loadThreeJS();

        vrState.scene = new THREE.Scene();
        vrState.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );

        vrState.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        vrState.renderer.setSize(window.innerWidth, window.innerHeight);
        vrState.renderer.setPixelRatio(window.devicePixelRatio);
        vrState.renderer.xr.enabled = true;
        document.body.appendChild(vrState.renderer.domElement);

        Object.assign(vrState.renderer.domElement.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            zIndex: '99998',
            width: '100%',
            height: '100%',
            display: 'none'
        });

        const geometry = new THREE.SphereGeometry(500, 60, 40);
        geometry.scale(-1, 1, 1);

        vrState.videoElement = document.querySelector('video');
        if (!vrState.videoElement) {
            console.warn("No video element found, creating placeholder");
            vrState.videoElement = document.createElement('video');
            vrState.videoElement.style.display = 'none';
        }

        const texture = new THREE.VideoTexture(vrState.videoElement);
        const material = new THREE.MeshBasicMaterial({ map: texture });
        vrState.sphere = new THREE.Mesh(geometry, material);
        vrState.scene.add(vrState.sphere);

        vrState.camera.position.set(0, 0, 0.1);

        setupInputHandlers();
        setupGyroscope();
        animate();
        createVRButton();
        await initWebXR();

        console.log("✅ 360 View Initialized");
    };

    // Setup Gyroscope / Device Orientation
    const setupGyroscope = () => {
        if (window.DeviceOrientationEvent) {
            console.log("📡 Gyroscope (DeviceOrientation) supported");
            
            const handleOrientation = (event) => {
                if (!vrState.isActive || vrState.isUserInteracting) return;

                let lon, lat;
                
                // Android standard orientation handling
                if (window.orientation === 90 || window.orientation === -90) {
                    // Landscape
                    lon = event.alpha + event.beta;
                    lat = (window.orientation === 90) ? event.gamma : -event.gamma;
                } else {
                    // Portrait
                    lon = event.alpha;
                    lat = event.beta - 90;
                }

                if (lon !== undefined && lat !== undefined) {
                    vrState.rotation.lon = lon;
                    vrState.rotation.lat = lat;
                }
            };

            // Android specific sensor permission/init
            window.addEventListener('deviceorientation', handleOrientation, true);

            // Request permission for iOS 13+ (if applicable, though this is Android)
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                const gyroBtn = document.createElement('button');
                gyroBtn.innerHTML = '📳 ENABLE GYRO';
                gyroBtn.style.cssText = `
                    position: fixed; bottom: 120px; right: 20px; z-index: 99999;
                    padding: 10px; background: rgba(0,0,0,0.8); color: white;
                    border: 1px solid #00ff00; border-radius: 5px;
                `;
                gyroBtn.onclick = () => {
                    DeviceOrientationEvent.requestPermission()
                        .then(response => {
                            if (response === 'granted') {
                                window.addEventListener('deviceorientation', handleOrientation);
                                gyroBtn.style.display = 'none';
                            }
                        })
                        .catch(console.error);
                };
                document.body.appendChild(gyroBtn);
            } else {
                window.addEventListener('deviceorientation', handleOrientation);
            }
        } else {
            console.warn("📡 Gyroscope not supported by this browser");
        }
    };

    // Setup Input Handlers
    const setupInputHandlers = () => {
        const onPointerDown = (e) => {
            vrState.isUserInteracting = true;
            vrState.pointerStart.x = e.clientX || e.touches?.[0]?.clientX || 0;
            vrState.pointerStart.y = e.clientY || e.touches?.[0]?.clientY || 0;
        };

        const onPointerMove = (e) => {
            if (!vrState.isUserInteracting) return;
            const x = e.clientX || e.touches?.[0]?.clientX || 0;
            const y = e.clientY || e.touches?.[0]?.clientY || 0;
            vrState.rotation.lon += (vrState.pointerStart.x - x) * 0.1;
            vrState.rotation.lat += (y - vrState.pointerStart.y) * 0.1;
            vrState.pointerStart.x = x;
            vrState.pointerStart.y = y;
        };

        const onPointerUp = () => {
            vrState.isUserInteracting = false;
        };

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', onPointerUp);
        document.addEventListener('touchstart', onPointerDown);
        document.addEventListener('touchmove', onPointerMove);
        document.addEventListener('touchend', onPointerUp);

        const updateGamepad = () => {
            const gamepads = navigator.getGamepads();
            for (let gp of gamepads) {
                if (!gp) continue;
                
                if (gp.axes.length >= 4) {
                    vrState.rotation.lon += gp.axes[2] * 2;
                    vrState.rotation.lat += gp.axes[3] * 2;
                }

                if (gp.buttons.length >= 7) {
                    if (gp.buttons[6].pressed) vrState.camera.fov = Math.max(20, vrState.camera.fov - 1);
                    if (gp.buttons[7].pressed) vrState.camera.fov = Math.min(120, vrState.camera.fov + 1);
                    vrState.camera.updateProjectionMatrix();
                }
            }
        };

        const gamepadLoop = () => {
            updateGamepad();
            requestAnimationFrame(gamepadLoop);
        };
        gamepadLoop();
    };

    // Create VR Toggle Button
    const createVRButton = () => {
        const btn = document.createElement('button');
        btn.innerHTML = '🔄 360 VIEW';
        btn.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 99999;
            padding: 12px 20px; background: rgba(0,0,0,0.8); color: white;
            border: 2px solid #00ff00; border-radius: 8px; font-weight: bold;
            cursor: pointer; font-size: 14px; transition: all 0.3s;
        `;
        btn.onmouseover = () => btn.style.background = 'rgba(0,255,0,0.2)';
        btn.onmouseout = () => btn.style.background = 'rgba(0,0,0,0.8)';
        btn.onclick = () => {
            vrState.isActive = !vrState.isActive;
            if (vrState.isActive) {
                vrState.renderer.domElement.style.display = 'block';
                btn.innerHTML = '❌ EXIT 360';
            } else {
                vrState.renderer.domElement.style.display = 'none';
                btn.innerHTML = '🔄 360 VIEW';
            }
        };
        document.body.appendChild(btn);
    };

    // Animation Loop
    const animate = () => {
        requestAnimationFrame(animate);

        vrState.rotation.lat = Math.max(-85, Math.min(85, vrState.rotation.lat));
        const phi = THREE.MathUtils.degToRad(90 - vrState.rotation.lat);
        const theta = THREE.MathUtils.degToRad(vrState.rotation.lon);

        const target = new THREE.Vector3(
            500 * Math.sin(phi) * Math.cos(theta),
            500 * Math.cos(phi),
            500 * Math.sin(phi) * Math.sin(theta)
        );

        vrState.camera.lookAt(target);
        vrState.renderer.render(vrState.scene, vrState.camera);
    };

    window.addEventListener('resize', () => {
        if (vrState.camera && vrState.renderer) {
            vrState.camera.aspect = window.innerWidth / window.innerHeight;
            vrState.camera.updateProjectionMatrix();
            vrState.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    });

    detectDevice();
    init360View().catch(console.error);

    console.log("✅ 360 VR Enhanced Patch Ready");
})();
