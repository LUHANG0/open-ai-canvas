import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { activeAuthFlow, authDestination, beginAuthNavigation, clearAuthNavigation } from "../src/lib/auth-navigation";

test("a failed physical deletion immediately revokes the previously stored flow in this document", () => {
    const dom = new Window({ url: "http://localhost/login" });
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { configurable: true, value: dom });
    const storage = dom.sessionStorage;
    const previousRemove = Object.getOwnPropertyDescriptor(storage, "removeItem");
    try {
        const flow = beginAuthNavigation();
        expect(storage.getItem("mengceng.auth-navigation.flow")).toBe(flow);
        expect(activeAuthFlow(flow)).toBe(true);
        Object.defineProperty(storage, "removeItem", { configurable: true, value: () => { throw new Error("fixture read-only storage"); } });
        clearAuthNavigation();
        expect(storage.getItem("mengceng.auth-navigation.flow")).toBe(flow);
        expect(activeAuthFlow(flow)).toBe(false);
        expect(authDestination({ authReturn: { next: "/settings?section=profile#security", flow } })).toBe("/create");
    } finally {
        if (previousRemove) Object.defineProperty(storage, "removeItem", previousRemove);
        else Reflect.deleteProperty(storage, "removeItem");
        clearAuthNavigation();
        if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
        else Reflect.deleteProperty(globalThis, "window");
        dom.happyDOM.abort();
    }
});
