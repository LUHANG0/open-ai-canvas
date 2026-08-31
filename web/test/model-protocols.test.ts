import { describe, expect, test } from "bun:test";

import { modelProtocolSupportsTokenBilling } from "../src/lib/model-protocols";

describe("model protocol Token billing", () => {
    test("supports text models, Volcengine Ark video, and declared plugin protocols", () => {
        expect(modelProtocolSupportsTokenBilling("text", "chat-completion")).toBe(true);
        expect(modelProtocolSupportsTokenBilling("video", "volcengine-ark-video")).toBe(true);
        expect(modelProtocolSupportsTokenBilling("video", "kemei-video", [{
            value: "kemei-video",
            label: "科美视频",
            capability: "video",
            create: "POST /v1/videos/generations",
            contentType: "application/json",
            media: "Kemei · 1.1.0",
            tokenUsage: true,
        }])).toBe(true);
        expect(modelProtocolSupportsTokenBilling("video", "volcengine-jimeng-video")).toBe(false);
        expect(modelProtocolSupportsTokenBilling("video", "newapi")).toBe(false);
        expect(modelProtocolSupportsTokenBilling("image", "volcengine-ark-image")).toBe(false);
    });
});
