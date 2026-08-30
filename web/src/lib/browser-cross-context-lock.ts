type AsyncLockManager = {
    request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

type FallbackLockRecord = {
    name: string;
    owner: string;
    expiresAt: number;
};

type CrossContextLockOptions = {
    required?: boolean;
    unavailableMessage?: string;
};

// v2 drops stale leases created by the initial compatibility implementation,
// whose two-minute crash window could keep a refreshed page blocked too long.
const FALLBACK_LOCK_DB = "infinite-canvas-cross-context-locks-v2";
const FALLBACK_LOCK_STORE = "locks";
const FALLBACK_LOCK_LEASE_MS = 30_000;
const FALLBACK_LOCK_HEARTBEAT_MS = 5_000;
const FALLBACK_LOCK_RETRY_MS = 50;

let fallbackDatabase: Promise<IDBDatabase> | undefined;

function nativeLockManager(): AsyncLockManager | undefined {
    if (typeof navigator === "undefined") return undefined;
    const locks = (navigator as Navigator & { locks?: AsyncLockManager }).locks;
    return locks && typeof locks.request === "function" ? locks : undefined;
}

function fallbackLockSupported() {
    return typeof window !== "undefined" && typeof document !== "undefined" && typeof indexedDB !== "undefined";
}

function openFallbackDatabase() {
    fallbackDatabase ??= new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(FALLBACK_LOCK_DB, 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(FALLBACK_LOCK_STORE)) database.createObjectStore(FALLBACK_LOCK_STORE, { keyPath: "name" });
        };
        request.onsuccess = () => {
            const database = request.result;
            database.onversionchange = () => {
                database.close();
                fallbackDatabase = undefined;
            };
            resolve(database);
        };
        request.onerror = () => {
            fallbackDatabase = undefined;
            reject(request.error || new Error("浏览器跨页面锁存储初始化失败"));
        };
        request.onblocked = () => {
            fallbackDatabase = undefined;
            reject(new Error("浏览器跨页面锁存储被占用"));
        };
    });
    return fallbackDatabase;
}

async function updateFallbackLock(name: string, update: (record: FallbackLockRecord | undefined, store: IDBObjectStore) => boolean) {
    const database = await openFallbackDatabase();
    return new Promise<boolean>((resolve, reject) => {
        const transaction = database.transaction(FALLBACK_LOCK_STORE, "readwrite");
        const store = transaction.objectStore(FALLBACK_LOCK_STORE);
        const request = store.get(name) as IDBRequest<FallbackLockRecord | undefined>;
        let result = false;
        let actionError: unknown;
        request.onsuccess = () => {
            try {
                // Keep the read/decision/write in the same IndexedDB callback so the
                // transaction stays active and competing tabs cannot both acquire it.
                result = update(request.result, store);
            } catch (error) {
                actionError = error;
                transaction.abort();
            }
        };
        request.onerror = () => {
            actionError = request.error || new Error("浏览器跨页面锁读写失败");
            transaction.abort();
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(actionError || transaction.error || new Error("浏览器跨页面锁事务失败"));
        transaction.onabort = () => reject(actionError || transaction.error || new Error("浏览器跨页面锁事务中止"));
    });
}

function delay(milliseconds: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function createBrowserCoordinationToken() {
    if (typeof crypto !== "undefined") {
        if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
        if (typeof crypto.getRandomValues === "function") {
            const bytes = crypto.getRandomValues(new Uint8Array(16));
            return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
        }
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function requestFallbackLock<T>(name: string, callback: () => Promise<T>): Promise<T> {
    const owner = createBrowserCoordinationToken();
    while (
        !(await updateFallbackLock(name, (record, store) => {
            const current = Date.now();
            if (record && record.expiresAt > current) return false;
            store.put({ name, owner, expiresAt: current + FALLBACK_LOCK_LEASE_MS } satisfies FallbackLockRecord);
            return true;
        }))
    ) {
        await delay(FALLBACK_LOCK_RETRY_MS);
    }

    const heartbeat = setInterval(() => {
        void updateFallbackLock(name, (record, store) => {
            if (record?.owner !== owner) return false;
            store.put({ ...record, expiresAt: Date.now() + FALLBACK_LOCK_LEASE_MS } satisfies FallbackLockRecord);
            return true;
        }).catch(() => undefined);
    }, FALLBACK_LOCK_HEARTBEAT_MS);

    try {
        return await callback();
    } finally {
        clearInterval(heartbeat);
        await updateFallbackLock(name, (record, store) => {
            if (record?.owner !== owner) return false;
            store.delete(name);
            return true;
        });
    }
}

/**
 * Runs a browser-side critical section across tabs/windows. Web Locks is preferred;
 * IndexedDB provides the compatibility path for browsers that do not expose it.
 */
export async function withBrowserCrossContextLock<T>(name: string, callback: () => Promise<T>, options: CrossContextLockOptions = {}): Promise<T> {
    const native = nativeLockManager();
    if (native) return native.request(name, callback);
    if (fallbackLockSupported()) {
        let entered = false;
        try {
            return await requestFallbackLock(name, async () => {
                entered = true;
                return callback();
            });
        } catch (error) {
            if (entered || options.required) throw error;
        }
    } else if (options.required && typeof window !== "undefined" && typeof document !== "undefined") {
        throw new Error(options.unavailableMessage || "当前浏览器不支持跨页面安全锁");
    }
    return callback();
}
