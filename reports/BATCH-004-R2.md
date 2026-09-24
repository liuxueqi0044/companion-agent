# BATCH-004-R2 · M00.0.04 单卡修订提交

状态：**submitted，等待交接方独立复核**。M00.0.05 已内容验收，本轮全部只读；.04 独立复核前可解锁累计仍为 9。

- 唯一产品目录：C:\Users\xiayu\Documents\Codex\companion-agent
- 派工：docs/handoff/BATCH-004-R2.md
- 基线：sha256:cb8cd8e8342551f54176618f2564013063f257bc799ac938da825c88eb681b8d
- 原卡规范哈希：b7f42e512a782b1619baf058c2a2e9b5aa9ee5d8c763e9ef5236bc4e36c361a3
- M00.0.04 result_ref：manifest-sha256:5764c10b2ed021cfb69f2ab006b8b5be1e2ebe78c8a7d262caeb0afeed14942a

## B4R1-R1

真实锁定 Vitest 5.0.1 的两个同名 describe("group") 各含一个通过用例，原生 3 suites / 2 tests / success=true；扁平 JSON 两个 ancestorTitles 都是 ["group"]。旧的标题路径去重等式把合法报告误判损坏。现在只要求报告 suite 总数不小于可见的文件根与不同标题前缀所证明的下界，并继续核对 suite 汇总守恒、整数和用例状态、success/失败标志、执行文件精确白名单。

原生空组不会出现在用例标题路径中，且该锁定版对空组返回 runner exit 1。修订后验证器接受其报告计数，同时如实返回 failed。普通单组、不同名嵌套组均保持 passed。原精确 include、混合类型整卡 not_run、负数/布尔/非整数及损坏/矛盾报告拒绝均有针对性回归。

## 命令与结果

- 真实预修复复现：pytest -vv -k test_vitest_real_suite_shapes → 3 failed / 2 passed（预期红灯），证据 reports/evidence/M00.0.04/logs/R2-pre-fix-reproduction.txt。
- 五种原生 suite 形态 → 5 passed，逐例原生与验证器机器数值见 reports/evidence/M00.0.04/logs/R2-native-suite-shapes.txt。
- 针对性反例 → 19 passed，见 reports/evidence/M00.0.04/logs/R2-targeted-regressions.txt。
- 验证器完整单测 → 94 passed，见 reports/evidence/M00.0.04/logs/R2-pytest-verifier.txt。
- 冻结 Node/npm 原 Vitest smoke → 2 files / 6 tests passed，见 reports/evidence/M00.0.04/logs/R2-vitest-smoke.txt。

## 写集与校验

changed_files_this_round 逐项在 reports/M00.0.04.json；累计 changed_files 保留原卡写集和本卡 evidence，历史 vitest.config.ts 保留在 dispatch_changed_files 与三文件 manifest。M00.0.05 与 reviews/、派工/基线/依赖等均未改。

batch_level_changed_files：
- reports/BATCH-004-R2.md（本摘要）。

权威范围检查：.local-tools/python-3.13.15/python.exe docs/handoff/check_batch004_r2_scope.py；最终含自身的结果见 reports/evidence/M00.0.04/logs/R2-final-scope.txt。开始前 modified=0、added=0、missing=0、outside=[]；最终含自身复跑两次均 exit 0：modified=6、added=8、missing=0、outside=[]、PASS。

## 限制与下一步

扁平 Vitest JSON 无法证明同名 suite 的唯一身份或空组准确数，本轮只使用可证明的下界，不能把更大的 suite 数单凭标题差异判损坏。M00.6.05、M04.1.01、M04.4.02 的混合语言执行留后续单独扩展，当前整体 not_run。taskctl validate exit 0；next --repo . exit 0，M00.0.04 仍为 changes_requested、accepted=9，日志 reports/evidence/M00.0.04/logs/R2-taskctl.txt。下一步仅由交接方独立复核；本轮不开展 Hermes、模型/账号调用或批外任务。
