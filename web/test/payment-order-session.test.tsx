import { afterAll, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    SVGElement: dom.SVGElement,
    ShadowRoot: dom.ShadowRoot,
    Element: dom.Element,
    Node: dom.Node,
    ResizeObserver: dom.ResizeObserver,
    MutationObserver: dom.MutationObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App, ConfigProvider } = await import("antd");
const { usePaymentOrderFlow } = await import("../src/components/payment/use-payment-order-flow");
const { useUserStore } = await import("../src/stores/use-user-store");
const { setActiveUserScope } = await import("../src/lib/user-scope");
const { http } = await import("../src/services/api/request");
type Flow = ReturnType<typeof usePaymentOrderFlow>;
type Order = import("../src/services/api/payments").PaymentOrder;
const initialUser = useUserStore.getState();

function order(id: string, status = "closed"): Order {
    return { id, productKind: "credits", productName: id, amountFen: 100, currency: "CNY", creditsMicrocredits: 100, status, checkout: { mode: "" }, expiresAt: "2099-01-01T00:00:00Z" } as Order;
}
function identity(id: string) {
    setActiveUserScope(id);
    useUserStore.setState({ user: { id, username: id, displayName: id, role: "user", status: "active" }, hydrated: true });
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
async function mount(run: (getFlow: () => Flow, granted: string[]) => Promise<void>) {
    identity("payment-owner-a");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const granted: string[] = [];
    let flow!: Flow;
    function Harness() {
        flow = usePaymentOrderFlow({
            onGranted: (value) => {
                granted.push(value.id);
            },
        });
        return flow.dialog;
    }
    try {
        await act(async () =>
            root.render(
                <StrictMode>
                    <ConfigProvider theme={{ token: { motion: false } }}>
                        <App>
                            <Harness />
                        </App>
                    </ConfigProvider>
                </StrictMode>,
            ),
        );
        await run(() => flow, granted);
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
}
afterAll(() => {
    useUserStore.setState(initialUser);
    dom.happyDOM.abort();
    for (const [key, value] of originals) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key);
});

test("StrictMode setup replay keeps payment readback active and latest order wins", async () => {
    const first = deferred<{ order: Order }>();
    const get = spyOn(http, "get").mockImplementation(async (url) => (url.endsWith("first") ? (first.promise as never) : ({ order: order("latest-order") } as never)));
    const post = spyOn(http, "post").mockImplementation(async () => {
        throw new Error("unexpected payment write");
    });
    try {
        await mount(async (flow, granted) => {
            let pending!: Promise<void>;
            await act(async () => {
                pending = flow().showOrder("first");
            });
            await act(async () => {
                await flow().showOrder("latest");
            });
            expect(document.querySelector(".workspace-wallet-payment")?.textContent).toContain("latest-order");
            await act(async () => {
                first.resolve({ order: order("stale-order", "credited") });
                await pending;
            });
            expect(document.querySelector(".workspace-wallet-payment")?.textContent).toContain("latest-order");
            expect(document.querySelector(".workspace-wallet-payment")?.textContent).not.toContain("stale-order");
            expect(granted).toEqual([]);
            expect(post).not.toHaveBeenCalled();
        });
    } finally {
        get.mockRestore();
        post.mockRestore();
    }
});

test("late old-account order cannot open a checkout or announce a grant", async () => {
    const response = deferred<{ order: Order }>();
    const get = spyOn(http, "get").mockImplementation(async () => response.promise as never);
    try {
        await mount(async (flow, granted) => {
            let pending!: Promise<void>;
            await act(async () => {
                pending = flow().showOrder("private-old-order");
            });
            await act(async () => {
                identity("payment-owner-b");
                response.resolve({ order: order("private-old-order", "credited") });
                await pending;
            });
            expect(document.querySelector(".workspace-wallet-payment")).toBeNull();
            expect(granted).toEqual([]);
        });
    } finally {
        get.mockRestore();
    }
});

test("double submit is fenced before React rerenders and late receipt stops after switch", async () => {
    const response = deferred<{ order: Order }>();
    const post = spyOn(http, "post").mockImplementation(async () => response.promise as never);
    try {
        await mount(async (flow, granted) => {
            let pending!: Promise<void>;
            await act(async () => {
                pending = flow().start("fixture-product", "fixture-provider");
                await flow().start("fixture-product", "fixture-provider");
            });
            expect(post).toHaveBeenCalledTimes(1);
            await act(async () => {
                identity("payment-owner-b");
                response.resolve({ order: order("old-creation", "credited") });
                await pending;
            });
            expect(document.querySelector(".workspace-wallet-payment")).toBeNull();
            expect(granted).toEqual([]);
        });
    } finally {
        post.mockRestore();
    }
});

test("returning to an already granted order A after B announces each order only once", async () => {
    const get = spyOn(http, "get").mockImplementation(async (url) => ({ order: order(url.endsWith("a") ? "a" : "b", "credited") }) as never);
    try {
        await mount(async (flow, granted) => {
            for (const id of ["a", "b", "a", "b"])
                await act(async () => {
                    await flow().showOrder(id);
                });
            expect(granted).toEqual(["a", "b"]);
        });
    } finally {
        get.mockRestore();
    }
});

test("a late failed create cannot announce an error over a newer order readback", async () => {
    let reject!: (error: Error) => void;
    const pending = new Promise<never>((_resolve, fail) => {
        reject = fail;
    });
    const post = spyOn(http, "post").mockImplementation(async () => pending);
    const get = spyOn(http, "get").mockImplementation(async () => ({ order: order("new-order") }) as never);
    try {
        await mount(async (flow) => {
            let creation!: Promise<void>;
            await act(async () => {
                creation = flow().start("p", "provider");
            });
            await act(async () => {
                await flow().showOrder("new-order");
            });
            await act(async () => {
                reject(new Error("stale-create-error"));
                await creation;
            });
            expect(document.body.textContent).not.toContain("stale-create-error");
            expect(document.querySelector(".workspace-wallet-payment")?.textContent).toContain("new-order");
        });
    } finally {
        post.mockRestore();
        get.mockRestore();
    }
});
