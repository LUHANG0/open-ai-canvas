import { expect, test } from "bun:test";
import { getTimelineTimeAtOffset, getTimelineTrackWidth } from "../src/lib/timeline/timeline-view";

test("短片段标尺定位不被960px最小宽度压缩", () => {
    expect(getTimelineTrackWidth(4800, 1, 900)).toBe(960);
    expect(getTimelineTimeAtOffset(192, 0.096, 4800)).toBe(2000);
    expect(getTimelineTimeAtOffset(460.8, 0.096, 4800)).toBe(4800);
});

test("缩放与滚动后的本地偏移仍使用片段比例，留白及负位置钳制", () => {
    expect(getTimelineTimeAtOffset(384, 0.192, 4800)).toBe(2000);
    expect(getTimelineTimeAtOffset(96, 0.048, 4800)).toBe(2000);
    expect(getTimelineTimeAtOffset(900, 0.096, 4800)).toBe(4800);
    expect(getTimelineTimeAtOffset(-40, 0.096, 4800)).toBe(0);
});
