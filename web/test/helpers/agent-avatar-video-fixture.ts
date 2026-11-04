import { Window } from "happy-dom";

export function avatarFixture(options: { unavailable?: boolean; compileFailure?: boolean; linkFailure?: boolean; textureFailure?: boolean; uploadError?: boolean; noVideoCallback?: boolean; twoDFailure?: boolean } = {}) {
    const dom = new Window({ url: "http://localhost/" });
    const document = dom.document;
    const host = document.createElement("div");
    document.body.append(host);
    const video = document.createElement("video");
    video.src = "/one.mp4";
    host.append(video);
    Object.defineProperties(video, {
        readyState: { configurable: true, writable: true, value: 4 },
        currentSrc: { configurable: true, get: () => video.src },
        videoWidth: { configurable: true, writable: true, value: 640 },
        videoHeight: { configurable: true, writable: true, value: 480 },
        paused: { configurable: true, writable: true, value: false },
        ended: { configurable: true, writable: true, value: false },
    });
    const callbacks = new Map<number, () => void>();
    let sequence = 0;
    const cancelled: number[] = [];
    const request = (callback: () => void) => {
        const id = ++sequence;
        callbacks.set(id, callback);
        return id;
    };
    const cancel = (id: number) => {
        cancelled.push(id);
        callbacks.delete(id);
    };
    Object.defineProperties(video, {
        requestVideoFrameCallback: { configurable: true, value: options.noVideoCallback ? undefined : request },
        cancelVideoFrameCallback: { configurable: true, value: cancel },
    });
    Object.defineProperties(dom, {
        requestAnimationFrame: { configurable: true, value: request },
        cancelAnimationFrame: { configurable: true, value: cancel },
    });
    const records: Array<{ canvas: HTMLCanvasElement; kind: string; draws: number; reads: number; puts: number; uploaded: number; deleted: string[]; pixels: number[]; gl: unknown }> = [];
    let errors = 0;
    Object.defineProperty(dom.HTMLCanvasElement.prototype, "getContext", {
        configurable: true,
        value: function (this: HTMLCanvasElement, kind: string, attributes: unknown) {
            const existing = records.find((r) => r.canvas === this);
            if (existing) {
                if (existing.kind !== kind) throw Error("Cannot change canvas context kind");
                return existing.gl;
            }
            if (kind === "webgl" && options.unavailable) return null;
            if (kind === "2d" && options.twoDFailure) return null;
            const record = { canvas: this, kind, draws: 0, reads: 0, puts: 0, uploaded: 0, deleted: [] as string[], pixels: [] as number[], gl: null as unknown };
            records.push(record);
            if (kind === "2d") {
                record.gl = {
                    drawImage() {
                        record.draws++;
                    },
                    getImageData() {
                        record.reads++;
                        return { data: new Uint8ClampedArray([100, 125, 100, 128, 10, 220, 10, 255]) };
                    },
                    putImageData(image: ImageData) {
                        record.puts++;
                        record.pixels = Array.from(image.data);
                    },
                };
            } else {
                let objectId = 0;
                const gl: Record<string, unknown> = { attributes, canvas: this };
                for (const [index, name] of [
                    "VERTEX_SHADER",
                    "FRAGMENT_SHADER",
                    "COMPILE_STATUS",
                    "LINK_STATUS",
                    "ARRAY_BUFFER",
                    "STATIC_DRAW",
                    "FLOAT",
                    "TEXTURE_2D",
                    "TEXTURE0",
                    "TEXTURE_WRAP_S",
                    "TEXTURE_WRAP_T",
                    "CLAMP_TO_EDGE",
                    "TEXTURE_MIN_FILTER",
                    "TEXTURE_MAG_FILTER",
                    "LINEAR",
                    "RGBA",
                    "UNSIGNED_BYTE",
                    "TRIANGLE_STRIP",
                    "UNPACK_FLIP_Y_WEBGL",
                    "UNPACK_PREMULTIPLY_ALPHA_WEBGL",
                    "UNPACK_COLORSPACE_CONVERSION_WEBGL",
                    "BROWSER_DEFAULT_WEBGL",
                    "MAX_TEXTURE_SIZE",
                    "NO_ERROR",
                    "BLEND",
                    "DITHER",
                ].entries())
                    gl[name] = index + 1;
                for (const name of ["createShader", "createProgram", "createBuffer", "createTexture"]) gl[name] = () => ({ id: ++objectId });
                for (const name of ["deleteShader", "deleteProgram", "deleteBuffer", "deleteTexture"]) gl[name] = () => record.deleted.push(name);
                for (const name of [
                    "shaderSource",
                    "compileShader",
                    "attachShader",
                    "linkProgram",
                    "bindBuffer",
                    "bufferData",
                    "useProgram",
                    "enableVertexAttribArray",
                    "vertexAttribPointer",
                    "activeTexture",
                    "bindTexture",
                    "texParameteri",
                    "pixelStorei",
                    "uniform1i",
                    "viewport",
                    "disable",
                    "clearColor",
                    "clear",
                ])
                    gl[name] = () => {};
                gl.getShaderParameter = () => !options.compileFailure;
                gl.getProgramParameter = () => !options.linkFailure;
                gl.getAttribLocation = () => 0;
                gl.getUniformLocation = () => ({});
                gl.getParameter = () => 8192;
                gl.getError = () => (options.uploadError && record.uploaded ? 1285 : gl.NO_ERROR);
                gl.isContextLost = () => false;
                gl.texImage2D = () => {
                    record.uploaded++;
                    if (options.textureFailure) throw Error("Texture upload failed");
                };
                gl.drawArrays = () => {
                    record.draws++;
                };
                record.gl = gl;
            }
            return record.gl;
        },
    });
    return {
        dom,
        host,
        video: video as unknown as HTMLVideoElement,
        records,
        callbacks,
        cancelled,
        onError: () => {
            errors++;
        },
        errors: () => errors,
        tick() {
            const entry = callbacks.entries().next().value;
            if (!entry) throw Error("No frame scheduled");
            callbacks.delete(entry[0]);
            entry[1]();
        },
        setVideo(values: Record<string, unknown>) {
            for (const [key, value] of Object.entries(values)) Object.defineProperty(video, key, { configurable: true, writable: true, value });
        },
        close() {
            dom.happyDOM.abort();
        },
    };
}
