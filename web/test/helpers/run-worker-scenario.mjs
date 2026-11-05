// Keep Happy DOM and Bun module mocks in a fresh process. Repeated Worker
// teardown crashes Bun 1.3.9 JSC before later scenarios can run on Linux.
let outcome;
globalThis.self = {
    postMessage(value) {
        outcome = value;
    },
};
await import(new URL(process.argv[2], import.meta.url));
await self.onmessage({ data: process.argv[3] });
if (!outcome || outcome.error) throw new Error(outcome?.error || "Scenario did not report a result");
console.log(JSON.stringify(outcome));
process.exit(0);
