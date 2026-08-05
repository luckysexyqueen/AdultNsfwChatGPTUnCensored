try {
    const canvas = document.getElementById('hdrCanvas');
    if (!canvas) {
        console.log('hdrCanvas element not found, skipping HDR');
    } else {
        const gl = canvas.getContext('webgl2', {
            colorSpace: 'srgb',
            pixelFormat: 'float16'
        });
        if (!gl) {
            console.log('WebGL2 not available');
        } else {
            function renderToHDR() {
                gl.clearColor(0.0, 0.0, 0.0, 1.0);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.activeTexture(gl.TEXTURE0);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }

            if (window.matchMedia('(dynamic-range: high)').matches) {
                console.log("HDR Display supported. Rendering HDR frame...");
                requestAnimationFrame(renderToHDR);
            } else {
                console.log("SDR Display detected.");
            }
        }
    }
} catch (e) {
    console.warn('HDR init error:', e);
}
