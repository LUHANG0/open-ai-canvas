import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
const dom = new Window();
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window:dom, document:dom.document, navigator:dom.navigator, HTMLElement:dom.HTMLElement, IS_REACT_ACT_ENVIRONMENT:true })) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useHeroReadiness } = await import("../src/components/brand/use-hero-readiness");
const timers = new Map<number,{ fn:()=>void; ms:number }>();
let next = 0;
dom.setTimeout = ((fn:()=>void, ms:number) => { timers.set(++next,{fn,ms}); return next; }) as any;
dom.clearTimeout = ((id:number)=>timers.delete(id)) as any;
let state:ReturnType<typeof useHeroReadiness>;
function Probe({ preview=false }) { state=useHeroReadiness(preview); return <div data-ready={state.ready} data-fallback={state.fallback} />; }
async function fixture(preview=false, font:Promise<unknown>=Promise.resolve([])) {
    Object.defineProperty(dom.document,"fonts",{configurable:true,value:{load:()=>font}});
    const host=dom.document.createElement("div");dom.document.body.append(host);const root=createRoot(host);
    await act(async()=>root.render(<Probe preview={preview}/>));
    return async()=>{await act(async()=>root.unmount());host.remove();};
}
afterAll(()=>{for(const[key,descriptor]of previous) {if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}});
test("waits for a real first frame, then reveals without a forced delay",async()=>{
    const close=await fixture();
    try {expect(state.ready).toBe(false);await act(async()=>state.onReady());expect(state.ready).toBe(true);expect(state.fallback).toBe(false);} finally{await close();}
    expect(timers.size).toBe(0);
});
test("slow font exits independently; failed media has a bounded local-artwork fallback",async()=>{
    const close=await fixture(false,new Promise(()=>{}));
    try {
        await act(async()=>{for(const t of timers.values())if(t.ms===1500)t.fn();});
        expect(state.ready).toBe(false);
        await act(async()=>{for(const t of timers.values())if(t.ms===8000)t.fn();});
        expect(state.ready).toBe(true);expect(state.fallback).toBe(true);
        await act(async()=>state.onReady());expect(state.fallback).toBe(false);
    } finally{await close();}
});
test("font failure still permits a loaded frame and preview never waits",async()=>{
    const close=await fixture(false,Promise.reject(new Error("font unavailable")));
    await act(async()=>state.onReady());expect(state.ready).toBe(true);await close();
    const closePreview=await fixture(true);expect(state.ready).toBe(true);expect(timers.size).toBe(0);await closePreview();
});
