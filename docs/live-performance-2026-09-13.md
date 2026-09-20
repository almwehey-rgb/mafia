# Live performance comparison — 2026-09-13

Production: https://mafia-night-iota.vercel.app/

Published deployment: dpl_DjcfmS9huQ5hxtLoDajZ63UBXoKV (READY). Previous: dpl_H5wjVcmvSBt6nDwTfuz2pQCGVqio.

| Metric (median of 3 runs) | Before | After |
|---|---:|---:|
| Load event | 7.21 s | 1.91 s |
| Largest contentful paint | 1.66 s | 1.72 s |
| First contentful paint | 0.60 s | 0.60 s |
| Total network bytes | 5029950 | 326149 |
| Resource entries | 40 | 34 |

Load time decreased 73.6%; bytes decreased 93.5%. LCP was 3.9% higher, so no improvement in main-content appearance is claimed.

Same Edge headless browser, 390×844 mobile viewport, 4 Mbps download, 80 ms emulated latency, CPU slowdown 4×, fresh browser context and disabled HTTP cache each run. Service workers were blocked in both sets to compare first visits. Each set has three runs; measurements collected after load, network idle and 1.5 seconds of settling. These are lab measurements on this machine, not real-user field metrics or multiplayer/API response benchmarks. No production login or game mutation was needed.

54/54 published assets matched SHA-256 of the staged release. Browser runs reported no page errors or HTTP failures. Current local interface regression also passed before deployment. API/database deployment was not part of this static release.

Raw results: artifacts/live-before.json and artifacts/live-after.json. Screenshots: artifacts/live-before.png and artifacts/live-after.png. Repeat benchmark: tests/live-performance.mjs.
