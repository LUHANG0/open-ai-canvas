import { expect, test } from "bun:test";
import { formatPaymentAmount } from "../src/services/api/payments";

test("payment amounts use the order currency and preserve minor units", () => {
    expect(formatPaymentAmount(101, "USD")).toBe("$1.01");
    expect(formatPaymentAmount(1000, "CNY")).toBe("¥10.00");
    expect(formatPaymentAmount(0, "USD")).toBe("$0.00");
    expect(formatPaymentAmount(123456, "USD")).toBe("$1,234.56");
    expect(formatPaymentAmount(1)).toBe("¥0.01");
    expect(formatPaymentAmount(250, " usd ")).toBe("$2.50");
});

test("other order currencies retain their code instead of being labelled CNY", () => {
    expect(formatPaymentAmount(1234, "EUR")).toBe("EUR 12.34");
    expect(formatPaymentAmount(1234, "HKD")).toBe("HKD 12.34");
});
