# BATCH-006 · 离线运行观测器与 AIRI 抽取分析

状态：**submitted，等待交接方独立复核**。唯一产品目录 `C:\Users\xiayu\Documents\Codex\companion-agent`。
派工 `docs/handoff/BATCH-006.md`；基线 `sha256:4a6be0d556bfe57be4dde9e347f535f4afcb20a6234b9be0f7e6c3ef50da4d2c`。累计 accepted 应仍为 11；实现者未修改 reviews/ 或写 accepted。

## 两目标结果

- **M00.3.01：submitted / partial。** 新增有界 JSONL 事件记录和固定离线子进程观测。13 项新回归与原 preflight 23 项通过。六个本地 fixture 场景已记录原始流、事件、快照、请求与实际退出；观察者断连后同 ID 只读恢复且不重跑。真实 Hermes A01–A03 全部 `not_run`，integration_evidence_kind=`not_run`。
- **M00.4.01：submitted。** 对固定 AIRI commit 的 `callout.vue` 及包/样式边界作来源取证；21 个官方文件 URL/hash/bytes 及既有 MIT 正文复算通过。结论是沿用 Vue 和原创 CSS，不复制 AIRI 文件或素材；没有 UI 小样或组件运行。

## 实际检查与边界

- 离线回归：`reports/evidence/M00.3.01/logs/B6-offline-regressions.txt`（13/13）；固定实际子进程记录：`reports/evidence/M00.3.01/offline/B6-fixture-execution.json`（6 场景）；原 preflight：`reports/evidence/M00.3.01/logs/B6-preflight-regressions.txt`（23/23，其旧版真实 Windows junction 夹具内部使用 `cmd.exe mklink` 建联接）。
- AIRI 来源完整性：`reports/evidence/M00.4.01/source-verify.txt`（21 条固定 commit 来源及 MIT 正文通过）。GitHub 匿名 API 403 后仅使用该 commit 官方 HTML/raw 数据；未安装或执行 AIRI。
- 未启动 Hermes、其他 Agent、产品服务，未读取凭据、调用模型/账号或部署。真实接入仍需隔离安装、只读工具策略、账号/模型及硬美元预算上限；稳定 native run ID、原生取消/重放语义未知。AIRI 素材逐项许可及可选 Uno 构建闭包仍 unknown，且未采用。
- 自动审批策略拒绝清理先前自生演示目录的递归删除；这些旧目录仍在本卡 tmp，未进入最终成果 manifest，最新六组记录由 `B6-fixture-execution.json` 唯一引用。

## 成果哈希

下列清单逐文件记录 SHA-256 与 bytes；报告、日志、checkpoint、manifest 本身不计入成果 manifest。

### M00.3.01

- manifest：`reports/evidence/M00.3.01/artifact-manifest.json`，SHA-256 `c5882f1474dfda83ce2787bee0d8a0ac9288cd1c7be13ffa678d93736838eef0`。
- report：`reports/M00.3.01.json`，SHA-256 `17ac32e5032f9b315eb75a354bd341466b2f27be1098e32e0c29e8a6ff222bce`。

| 路径 | SHA-256 | bytes |
| --- | --- | ---: |
| `docs/evidence/hermes-lifecycle.json` | `10fc23baf04fb9e6532538865a38f15d96a6f5f328536d6904e23af8e22563ad` | 14803 |
| `reports/evidence/M00.3.01/offline/B6-fixture-execution.json` | `ebd96980760a5819e8afbe39a892b8d48e8fd6d19c01e0c896506f3517892bb6` | 23029 |
| `reports/evidence/M00.3.01/offline/finalize_batch006.py` | `c22f869dca66d42628e106379d5081c531b64ae1db03f7e53e28565901a7db65` | 11144 |
| `reports/evidence/M00.3.01/offline/fixture_child.py` | `ac915f36fafb304ef7b9d94209447ac28a956d692e83c822fcccb60ebe8c9c4e` | 1617 |
| `reports/evidence/M00.3.01/offline/run_cases.py` | `02d941c4f92b00c59644db4615a3f403b83e92f80f52c418f0d327b31d759b57` | 1646 |
| `reports/evidence/M00.3.01/offline/test_observer.py` | `38b0780c6282a535f29f87bc86c68ef4fb3db86115a50bd449a68c25a6fa1299` | 7814 |
| `reports/evidence/M00.3.01/offline/write_batch_summary.py` | `c56e843031b5177ff3db457728d14630ccfd4974b7169b42ad2bb0067c296f58` | 4238 |
| `reports/evidence/M00.3.01/test_preflight.py` | `32689ce4de7d55cd5bba0cc3f2af13fb46bb93d3d09f1b9f51ba5a104a5c873d` | 15910 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/11f5992f-2782-4612-9920-d98a9c3f11c8/events.jsonl` | `703518a581a018b3a41d5a7dc10e62b13682bdae4f3f6059ace4e59ff2fa6120` | 1135 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/11f5992f-2782-4612-9920-d98a9c3f11c8/fixture-starts.txt` | `d16a143cfed1b61559d7320cd858997ec13094f00c119c63a7fe674745c744e9` | 7 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/11f5992f-2782-4612-9920-d98a9c3f11c8/snapshot.json` | `cd430e5629eb1e4e7a69687634b98dec6d087e615355bfa3e780e63f14776466` | 581 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/11f5992f-2782-4612-9920-d98a9c3f11c8/stderr.bin` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 0 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/11f5992f-2782-4612-9920-d98a9c3f11c8/stdout.bin` | `3a1f18ae46d039a41c5cf34d16510262c8a3a680888d372a74313e7f1d37778a` | 71 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/18145f18-c806-465d-9277-b24b4184dfef/events.jsonl` | `83a6b74776244562814ce203ca7eb657a24ce6736e99d1cf44f17c3b28e7f1bc` | 1588 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/18145f18-c806-465d-9277-b24b4184dfef/fixture-starts.txt` | `d16a143cfed1b61559d7320cd858997ec13094f00c119c63a7fe674745c744e9` | 7 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/18145f18-c806-465d-9277-b24b4184dfef/snapshot.json` | `6427183784555831595d5e491ac6104da72f13cb2ec88a89b89e16298aa136a5` | 555 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/18145f18-c806-465d-9277-b24b4184dfef/stderr.bin` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 0 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/18145f18-c806-465d-9277-b24b4184dfef/stdout.bin` | `f6834f3e58c026a9490cd735fa81ed6287d5f6863e9792ea6077f7be06ec6391` | 183 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/20f9a60c-3f6b-4999-910b-b09512c45f19/events.jsonl` | `428f48a197af647aa9ce6172daf6655f5ff7a0733e5157793612661d1b72f897` | 1997 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/20f9a60c-3f6b-4999-910b-b09512c45f19/fixture-starts.txt` | `d16a143cfed1b61559d7320cd858997ec13094f00c119c63a7fe674745c744e9` | 7 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/20f9a60c-3f6b-4999-910b-b09512c45f19/snapshot.json` | `ad058175d4988808c8a651fff674e4de77c580363d739bae8fa1f5e1ec1d71c2` | 609 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/20f9a60c-3f6b-4999-910b-b09512c45f19/stderr.bin` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 0 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/20f9a60c-3f6b-4999-910b-b09512c45f19/stdout.bin` | `198d5131e642658c7569a9b4628d1215822aef14f69019c96b950f1e1f5f0e9e` | 199 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/864c7e39-33ab-4fce-8fb6-f8d1211df6e9/events.jsonl` | `4339e81a3465c9d019438e0adbe8ba43aff6ca2fe10aed28e0f5108bef73978c` | 1382 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/864c7e39-33ab-4fce-8fb6-f8d1211df6e9/fixture-starts.txt` | `d16a143cfed1b61559d7320cd858997ec13094f00c119c63a7fe674745c744e9` | 7 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/864c7e39-33ab-4fce-8fb6-f8d1211df6e9/snapshot.json` | `a53d2e57e8f7b293aa6466143d916789031520bc6ae28fb0711f54dcf4facadb` | 678 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/864c7e39-33ab-4fce-8fb6-f8d1211df6e9/stderr.bin` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 0 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/864c7e39-33ab-4fce-8fb6-f8d1211df6e9/stdout.bin` | `3a1f18ae46d039a41c5cf34d16510262c8a3a680888d372a74313e7f1d37778a` | 71 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/eec29d6c-739d-48c3-97c3-6d3f5b8b6c6b/events.jsonl` | `d77cab500513214e344becc3e25339180c61783bfdb5d0c7b0219a4ee5247731` | 1616 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/eec29d6c-739d-48c3-97c3-6d3f5b8b6c6b/fixture-starts.txt` | `d16a143cfed1b61559d7320cd858997ec13094f00c119c63a7fe674745c744e9` | 7 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/eec29d6c-739d-48c3-97c3-6d3f5b8b6c6b/snapshot.json` | `b13f99c404aacbaea57bae166cff43514340396c6311a90b8ed65b6e49061152` | 690 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/eec29d6c-739d-48c3-97c3-6d3f5b8b6c6b/stderr.bin` | `b49b97f070f204ed23c597b887a89d0dc8b13064ffe8300946b28f34a4b4c0a5` | 128 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/eec29d6c-739d-48c3-97c3-6d3f5b8b6c6b/stdout.bin` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 0 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/eef7860c-314e-4a38-bd6a-2a70d085aac6/events.jsonl` | `c25e8ed8f763b6427b7925608929991ed469a15434f159f51e68c076c2fcbc8b` | 1563 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/eef7860c-314e-4a38-bd6a-2a70d085aac6/fixture-starts.txt` | `d16a143cfed1b61559d7320cd858997ec13094f00c119c63a7fe674745c744e9` | 7 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/eef7860c-314e-4a38-bd6a-2a70d085aac6/snapshot.json` | `fc5dc24bd62c6da44889ddd76f5b6efcb4f419444be8c65a42b35f88a630d854` | 702 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/eef7860c-314e-4a38-bd6a-2a70d085aac6/stderr.bin` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 0 |
| `reports/evidence/M00.3.01/tmp/B6-evidence-8679a4cf4bc5476cb29ccb4a55808edf/eef7860c-314e-4a38-bd6a-2a70d085aac6/stdout.bin` | `c8056fb6b27de7379e38aeb9a8f5dcc45b0c3348b517f97db6b57d0fd7cb15c1` | 4167 |
| `tests/spikes/hermes_eventlog.py` | `98bd294817aa4f855ef8d6b8233dab1523342ff3fb500f2a852f01a9bfc0be9a` | 9071 |
| `tests/spikes/hermes_lifecycle.py` | `860f3aff05f3508984e766d5e9f3eb1b904dc9a34678b46301fbf04b8418d372` | 14225 |
| `tests/spikes/hermes_observer.py` | `4c03f98e51cb2a502134298c6d2191c1ccc099d7533c9afd7c5c1aad2102b709` | 7639 |

### M00.4.01

- manifest：`reports/evidence/M00.4.01/artifact-manifest.json`，SHA-256 `1281a49e75992295426f3c1cbc625048400e3ceca49b90e08fdd9f8bcef343c1`。
- report：`reports/M00.4.01.json`，SHA-256 `c69dd16e4d58e5e68ab288dbea7047cf3b4518bbc7a667b1b5dc0b2d5156efe6`。

| 路径 | SHA-256 | bytes |
| --- | --- | ---: |
| `docs/evidence/airi-extraction.md` | `6a44938b718e46a95a59ce85eddd6d88620f7ccc6339b1ab35e1ebdec5c0f691` | 6154 |
| `reports/evidence/M00.4.01/index_sources.py` | `6d210f6940a73f9f1388070593fe487874dfa3c51cf50c935a937a82477caeab` | 1785 |
| `reports/evidence/M00.4.01/upstream/packages/stage-layouts/package.json` | `d27f1ab80ce55d9fd3ef6b80de500752aaaa22b76ed8675db90f99a93fc97674` | 2402 |
| `reports/evidence/M00.4.01/upstream/packages/stage-layouts/src/components/Layouts/HeaderAvatar.vue` | `ff50d361d39b507733c27cba048711ba0fca283e60b99d80474fe6ce5a9b888e` | 8174 |
| `reports/evidence/M00.4.01/upstream/packages/stage-layouts/src/components/Widgets/ChatContainer.vue` | `528cbfe550f4e41e6c956342920baf79bc82376872ebdc5e27a591491144232c` | 218 |
| `reports/evidence/M00.4.01/upstream/packages/stage-ui/uno.config.ts` | `e40af70bef549a5e9e03ecb91be116ad4b36e674a65ecf61014addbbbdbe663b` | 301 |
| `reports/evidence/M00.4.01/upstream/packages/ui/package.json` | `6f196dfd1b684a564bb9af3569bb8f9c3487ea72217efc8e3b77d792763849cb` | 1070 |
| `reports/evidence/M00.4.01/upstream/packages/ui/src/components/layouts/screen.vue` | `7babed49f1b4910a4cb7799bebd755dbc4b92b978e47c4220c57c1307eca8651` | 2123 |
| `reports/evidence/M00.4.01/upstream/packages/ui/src/components/misc/callout.vue` | `12b9d1556e69a6f6d2ff1711a6a99c11a1c0cd9f9ef027363d4d5c6aae9e4422` | 2208 |
| `reports/evidence/M00.4.01/upstream/packages/ui/src/components/misc/index.ts` | `721908203f2c0f8bd9ea2d003e74903ad0f90aff61c4ed8b22058b9c4e455ffd` | 841 |
| `reports/evidence/M00.4.01/upstream/packages/ui/src/main.css` | `1e2ef71cc0c103c13cbb158e3e53681de789dfba02a85730d79b15df0b60ac5d` | 243 |
| `reports/evidence/M00.4.01/upstream/packages/ui/src/style.css` | `51149799ddeb1758a2cd8ac3097958c07700cb978c42516dd4a86aa11d761d71` | 439 |
| `reports/evidence/M00.4.01/upstream/source-index.json` | `8a1fca896ff6cf568b46f1178ff0b848b6f0e630136f162071c12b44adab0aa8` | 9326 |
| `reports/evidence/M00.4.01/upstream/tree-packages.html` | `514d1126ba0819bb5fcd7cda71a29b0faae139f73c10976de9385db3c0919a01` | 340617 |
| `reports/evidence/M00.4.01/upstream/tree-stage-Widgets.html` | `704cda85291b03222de0c7926ca85a12e451bf9dbf8e4f2df3f78dcc02054c00` | 251481 |
| `reports/evidence/M00.4.01/upstream/tree-stage-layouts-components.html` | `67320a32ba98e056f1e309108f3dc17e3e47c973bf12cec50453f2d8d9fab593` | 242614 |
| `reports/evidence/M00.4.01/upstream/tree-stage-layouts-src.html` | `055041c3b0faf692afb9486ef5751de340149ea27c2987748be572eba070e86f` | 247839 |
| `reports/evidence/M00.4.01/upstream/tree-stage-layouts.html` | `d2bda7644defb11545ccf595cc976a04b00a3ffb6f65caede143dc07ecbb5113` | 257084 |
| `reports/evidence/M00.4.01/upstream/tree-stage-ui.html` | `d0dbf7a99f56d53586e255873ec97faf28d7ccd290d73704011cb6e8685de39c` | 288174 |
| `reports/evidence/M00.4.01/upstream/tree-ui-components.html` | `27e08cffb7cd150b92f2ed5e72200adbd5b9dc8f27b568e084f6a92752e6c3f9` | 244321 |
| `reports/evidence/M00.4.01/upstream/tree-ui-layouts.html` | `848c1fd32a6b41f4cdf103c4879ddc2f4ea19ea906cf06daef40675315070ab8` | 253212 |
| `reports/evidence/M00.4.01/upstream/tree-ui-misc.html` | `5afc41029e495eb623248c5ee7f6e917338c3ff84ff1047fb88a92c19bd4de70` | 272149 |
| `reports/evidence/M00.4.01/upstream/tree-ui-src.html` | `6cf82e93a149a684b4b43caf214889deee6d15648fb35119ee21761f0ed1be78` | 253052 |
| `reports/evidence/M00.4.01/upstream/uno.config.ts` | `0b6003bc7178621ba64aebfac625b196d225e6809f913fcb1d8dc04e2429597a` | 10830 |
| `reports/evidence/M00.4.01/verify_sources.py` | `73ebec0aa48d5197cfa715740f53cce06ed21b490905cd95c9ab1902faf8c07c` | 978 |

## 收尾

- 范围检查日志 `reports/evidence/M00.3.01/logs/B6-final-scope.txt`；以其最终 `outside=[]`/`PASS` 为准。
- `taskctl validate` 与 `next --repo .` 的原始结果分别见 `logs/B6-taskctl-validate.txt` 和 `logs/B6-taskctl-next.txt`；M00.3.01 live 卡不因本批离线证据转为 accepted。
- 两卡均止于 submitted，等待独立复核；不开展 M00.3.02/.03、M00.4.02。
