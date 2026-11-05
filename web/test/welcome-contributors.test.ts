import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseContributors } from "../src/pages/welcome/contributors-parse";

const identityAvatar = (path: string) => path;

test("welcome contributors parse an HTML table independent of the fork README", () => {
    const html = `## 贡献者与团队
<table><tr>
<td><img src="assets/example.png" alt="Example"><strong>Example<br>项目发起者 · 微信：example-id</strong><a href="mailto:example@example.com">邮箱</a><em>持续创作</em></td>
<td><img src="assets/hidden.png" alt="Hidden"><strong>Hidden</strong></td>
</tr></table>
## 下一章`;
    expect(parseContributors(html, (path) => (path.includes("hidden") ? undefined : path))).toEqual([{ name: "Example", avatar: "assets/example.png", email: "example@example.com", wechat: "example-id", signature: "持续创作", isFounder: true }]);
});

test("fork documentation without an upstream contributors section has no inferred people", () => {
    const readme = readFileSync(resolve(import.meta.dir, "../../README.md"), "utf8");
    expect(parseContributors(readme, identityAvatar)).toEqual([]);
});

test("welcome contributors still parse markdown pipe tables", () => {
    const markdown = `## 贡献者与团队

| 头像 | 昵称 | 邮箱 | 签名 |
| --- | --- | --- | --- |
| <img src="assets/user-example.jpg" alt="Example"> | Example<br>项目发起者 · 微信：example-id | founder@example.com | 把故事搬上银幕 |
| <img src="assets/user-ken.jpg" alt="ken"> | ken | ken@example.com | 走自己的路 |

## 下一章
`;
    expect(parseContributors(markdown, identityAvatar)).toEqual([
        {
            name: "Example",
            avatar: "assets/user-example.jpg",
            signature: "把故事搬上银幕",
            email: "founder@example.com",
            wechat: "example-id",
            isFounder: true,
        },
        {
            name: "ken",
            avatar: "assets/user-ken.jpg",
            signature: "走自己的路",
            email: "ken@example.com",
            wechat: undefined,
            isFounder: false,
        },
    ]);
});
