export type AgentAvatarVideoSession = {
    setClassName: (className?: string) => void;
    setSource: () => void;
    dispose: () => void;
};

type AvatarRenderer = {
    canvas: HTMLCanvasElement;
    draw: (video: HTMLVideoElement, width: number, height: number) => void;
    dispose: () => void;
};

const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 uv;
void main() {
    uv = (position + 1.0) * 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D frame;
varying vec2 uv;
void main() {
    // Match the 2D ImageData byte thresholds and positive Math.round operations.
    vec4 pixel = floor(texture2D(frame, uv) * 255.0 + 0.5);
    float lead = pixel.g - max(pixel.r, pixel.b);
    if (pixel.g > 70.0 && lead > 12.0 && pixel.g > pixel.r * 1.12 && pixel.g > pixel.b * 1.08) {
        float opacity = clamp((38.0 - lead) / 26.0, 0.0, 1.0);
        pixel.g = max(max(pixel.r, pixel.b), pixel.g - floor((1.0 - opacity) * lead * 0.75 + 0.5));
        pixel.a = floor(pixel.a * opacity + 0.5);
    }
    gl_FragColor = pixel / 255.0;
}`;

/** Existing CPU fallback, including despill and multiplication of source alpha. */
export function keyAgentAvatarPixels(pixels: Uint8ClampedArray) {
    for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const greenLead = green - Math.max(red, blue);
        if (green > 70 && greenLead > 12 && green > red * 1.12 && green > blue * 1.08) {
            const opacity = Math.max(0, Math.min(1, (38 - greenLead) / 26));
            pixels[index + 1] = Math.max(red, blue, green - Math.round((1 - opacity) * greenLead * 0.75));
            pixels[index + 3] = Math.round(pixels[index + 3] * opacity);
        }
    }
}

function createGLRenderer(canvas: HTMLCanvasElement): AvatarRenderer | null {
    // State clips can buffer between sources; retain the last keyed frame meanwhile.
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    let vertex: WebGLShader | null = null;
    let fragment: WebGLShader | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let texture: WebGLTexture | null = null;
    const dispose = () => {
        if (texture) gl.deleteTexture(texture);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        if (vertex) gl.deleteShader(vertex);
        if (fragment) gl.deleteShader(fragment);
        texture = null;
        buffer = null;
        program = null;
        vertex = null;
        fragment = null;
    };
    try {
        vertex = gl.createShader(gl.VERTEX_SHADER);
        fragment = gl.createShader(gl.FRAGMENT_SHADER);
        program = gl.createProgram();
        buffer = gl.createBuffer();
        texture = gl.createTexture();
        if (!vertex || !fragment || !program || !buffer || !texture) throw new Error("Avatar GL allocation failed");
        gl.shaderSource(vertex, VERTEX_SHADER);
        gl.compileShader(vertex);
        gl.shaderSource(fragment, FRAGMENT_SHADER);
        gl.compileShader(fragment);
        if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS) || !gl.getShaderParameter(fragment, gl.COMPILE_STATUS)) throw new Error("Avatar shader compilation failed");
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Avatar shader linking failed");
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "position");
        if (position < 0) throw new Error("Avatar shader position missing");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        // Flip DOM video's top-left origin to the quad's bottom-left texture origin.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
        gl.uniform1i(gl.getUniformLocation(program, "frame"), 0);
        // Shader output and the drawing buffer both use straight alpha. No blending.
        gl.disable(gl.BLEND);
        gl.disable(gl.DITHER);
        const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
        if (gl.getError() !== gl.NO_ERROR) throw new Error("Avatar GL setup failed");
        let inputWidth = 0;
        let inputHeight = 0;
        return {
            canvas,
            dispose,
            draw(video, width, height) {
                if (video.videoWidth > maxTextureSize || video.videoHeight > maxTextureSize) throw new Error("Avatar texture exceeds device limit");
                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width;
                    canvas.height = height;
                }
                gl.viewport(0, 0, width, height);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                // Check only allocation/size transitions, never poll GL errors per frame.
                if (inputWidth !== video.videoWidth || inputHeight !== video.videoHeight) {
                    if (gl.getError() !== gl.NO_ERROR) throw new Error("Avatar texture allocation failed");
                    inputWidth = video.videoWidth;
                    inputHeight = video.videoHeight;
                }
            },
        };
    } catch {
        dispose();
        return null;
    }
}

function create2DRenderer(canvas: HTMLCanvasElement): AvatarRenderer {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Avatar 2D context unavailable");
    return {
        canvas,
        dispose() {},
        draw(video, width, height) {
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            context.drawImage(video, 0, 0, width, height);
            const image = context.getImageData(0, 0, width, height);
            keyAgentAvatarPixels(image.data);
            context.putImageData(image, 0, 0);
        },
    };
}

/** Owns only the adjacent presentation canvas and one frame callback, never the video. */
export function startAgentAvatarVideo(video: HTMLVideoElement, onError: () => void): AgentAvatarVideoSession {
    const document = video.ownerDocument;
    const window = document.defaultView!;
    let source = video.src;
    let generation = 0;
    let className = "canvas-agent-keyed-video";
    let renderer: AvatarRenderer | null = null;
    let presented: HTMLCanvasElement | null = null;
    let gpuCanvas: HTMLCanvasElement | null = null;
    let using2D = false;
    let disposed = false;
    let failed = false;
    let animationFrame = 0;
    let videoFrame = 0;
    let lastFrameTime = -1;
    let lastWidth = 0;
    let lastHeight = 0;

    const makeCanvas = () => {
        const canvas = document.createElement("canvas");
        canvas.className = className;
        canvas.setAttribute("aria-hidden", "true");
        Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", userSelect: "none" });
        return canvas;
    };
    const cancelFrame = () => {
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        if (videoFrame && typeof video.cancelVideoFrameCallback === "function") video.cancelVideoFrameCallback(videoFrame);
        animationFrame = 0;
        videoFrame = 0;
    };
    const releaseGL = () => {
        gpuCanvas?.removeEventListener("webglcontextlost", contextLost);
        gpuCanvas = null;
        renderer?.dispose();
        renderer = null;
    };
    const fail = () => {
        if (disposed || failed) return;
        failed = true;
        cancelFrame();
        releaseGL();
        presented?.remove();
        presented = null;
        onError();
    };
    const fallback = () => {
        releaseGL();
        using2D = true;
        // A GL-bound canvas cannot become a 2D canvas. Prepare a fresh surface.
        renderer = create2DRenderer(makeCanvas());
        lastFrameTime = -1;
    };
    const drawFrame = () => {
        if (disposed || failed || video.src !== source || video.currentSrc !== source || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return;
        if (video.currentTime === lastFrameTime && video.videoWidth === lastWidth && video.videoHeight === lastHeight) return;
        const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight));
        const width = Math.max(1, Math.round(video.videoWidth * scale));
        const height = Math.max(1, Math.round(video.videoHeight * scale));
        try {
            try {
                renderer?.draw(video, width, height);
            } catch (error) {
                if (using2D) throw error;
                fallback();
                renderer!.draw(video, width, height);
            }
            if (disposed || failed || !renderer) return;
            const canvas = renderer.canvas;
            if (presented !== canvas) {
                // Keep the old surface until its keyed replacement has actually drawn.
                if (presented) presented.replaceWith(canvas);
                else video.before(canvas);
                presented = canvas;
            }
            lastFrameTime = video.currentTime;
            lastWidth = video.videoWidth;
            lastHeight = video.videoHeight;
        } catch {
            fail();
        }
    };
    function contextLost(event: Event) {
        event.preventDefault();
        if (disposed || failed || using2D) return;
        try {
            fallback();
            drawFrame();
        } catch {
            fail();
        }
    }
    const scheduleFrame = () => {
        if (disposed || failed) return;
        const scheduledGeneration = generation;
        if (typeof video.requestVideoFrameCallback === "function") {
            videoFrame = video.requestVideoFrameCallback(() => {
                if (disposed || failed || scheduledGeneration !== generation) return;
                videoFrame = 0;
                drawFrame();
                scheduleFrame();
            });
        } else {
            animationFrame = window.requestAnimationFrame(() => {
                if (disposed || failed || scheduledGeneration !== generation) return;
                animationFrame = 0;
                drawFrame();
                scheduleFrame();
            });
        }
    };
    try {
        const canvas = makeCanvas();
        try {
            renderer = createGLRenderer(canvas);
        } catch {
            renderer = null;
        }
        if (renderer) {
            gpuCanvas = canvas;
            canvas.addEventListener("webglcontextlost", contextLost);
        } else fallback();
        drawFrame();
        scheduleFrame();
    } catch {
        fail();
    }
    return {
        setClassName(next = "canvas-agent-keyed-video") {
            className = next;
            if (renderer) renderer.canvas.className = next;
            if (presented) presented.className = next;
        },
        setSource() {
            if (disposed || failed || source === video.src) return;
            generation++;
            cancelFrame();
            source = video.src;
            lastFrameTime = -1;
            drawFrame();
            scheduleFrame();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            cancelFrame();
            releaseGL();
            presented?.remove();
            presented = null;
        },
    };
}
