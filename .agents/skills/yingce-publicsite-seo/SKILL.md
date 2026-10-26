---
name: yingce-publicsite-seo
description: Maintain Yingce/MengCeng public feature pages, tutorials, crawlable homepage HTML, metadata, robots, sitemap, and search submission settings or jobs. Use for indexing and first-response SEO issues; use UI skills for purely visual brand changes and release-readiness for deployment.
---

# Public Site And Search Discovery

Read the current repository AGENTS.md and the affected implementation. This skill supports development of the public site; it does not authorize publishing CMS content, changing DNS, submitting URLs to search services, or deploying.

## Locate The Owning Layer

| Concern | Current entry points |
| --- | --- |
| Versioned feature/tutorial content and rendering | `backend/internal/publicsite/content/`, `catalog.go`, `render.go`, `page.html`, `site.css`, `site.js` |
| Public routes, response status and MIME | `backend/internal/handler/public_site.go` |
| Homepage HTML fragments | `backend/internal/handler/brand_site_html.go`, `backend/internal/app/brand_site.go` |
| Public origin, sitemap and search job orchestration | `backend/internal/app/seo_publication.go`, `backend/internal/publicsite/submissions.go` |
| Admin SEO controls | `web/src/pages/admin/settings/seo-settings-page.tsx`; trace its API caller and server authorization |
| HTTP assembly and frontend startup | `nginx.conf`, `web/vite.config.ts`, `web/index.html`, `web/src/components/ui/app-bootstrap-ready.tsx` |

The topic document `docs/content/docs/backend/mengceng-seo.mdx` contains implementation notes and historical environment records. Verify statements against current source and the target environment rather than treating an old release record as current evidence.

## Distinguish Content Sources And Responses

- Homepage copy comes from published brand CMS content, with appearance settings supplying metadata. Draft, previous versions, private assets and account data must not leak into public HTML or sitemap entries.
- Feature/tutorial pages use the embedded public content catalog, not the brand CMS. Check the catalog's publication flag, path/kind validation, related links, image constraints and real update date when editing content. Do not invent product availability, customer claims or search rankings.
- `CANVAS_PUBLIC_BASE_URL` supplies the public origin. Inspect the effective environment; do not infer it from the browser's host, an old deployment, or a fixed production domain. Missing or invalid configuration is a configuration error, not a reason to publish an arbitrary canonical URL.
- Inspect the initial HTTP response separately from the DOM after JavaScript. Production Nginx assembles the homepage with SSI; Vite does not reproduce that assembly. A successful Vite preview or React render alone cannot verify production SEO HTML.
- Preserve the fixed internal SSI destinations and removal of cookies/authorization on public subrequests. Keep the homepage-body boundary for `/` and its query strings; login, invitation, private workspace and admin routes must retain their own behavior.
- Keep robots and sitemap responses on their actual text/XML routes. A missing page or asset must not become a successful SPA fallback. Robots directives are not access control.

## Search Submission Is A Separate State Machine

Trace settings revision, encrypted credentials, publication revision, persistent job state, claim lease and completion token before changing queue behavior. Preserve deduplication, accepted jobs, bounded retries, provider cooldown and the worker's response to settings being disabled or changed. Reuse the current outbound policy and service authorization.

Use isolated HTTP substitutes and a disposable database for submission tests. Do not send real search submissions merely to test a code change. Keep credentials and credential-bearing URLs out of output and Git; the intentional IndexNow verification endpoint has a different visibility contract from private provider credentials.

Report these outcomes separately: content published, URL submitted, provider accepted, search engine indexed, and traffic/ranking observed. None establishes the next automatically. A spoofed crawler User-Agent does not prove genuine search bots can pass a CDN or firewall.

## Verify The Changed Contract

- Pure catalog/rendering changes: run `go test ./internal/publicsite` from `backend/`.
- Settings, publication or HTTP changes: inspect and run the relevant cases in `backend/internal/app/seo_publication_test.go`, `backend/internal/handler/public_site_test.go` and `backend/internal/handler/brand_site_html_test.go`. Their isolated data and fake transports must remain isolated; widen coverage when shared contracts change.
- HTML/startup changes: include `web/test/app-first-paint.test.tsx` and relevant appearance/brand tests, then inspect the real production-style Nginx response and browser startup. Check delayed JavaScript, normal startup, no-JavaScript content, mobile layout and authentication entry as affected. Public semantic content must not flash unstyled before the app is ready or remain hidden when JavaScript is disabled.
- For proxy or public-response changes, check status, content type, canonical origin, escaped metadata, sitemap contents, unknown paths, internal endpoint isolation and backend-unavailable fallback. Use an isolated candidate for failure simulation; do not interrupt a live service to manufacture evidence.

State which checks ran locally, which used production-style assembly, and which target-environment or search-platform outcomes remain unverified.
