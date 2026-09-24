# BATCH-004-R1 独立复核

结论：**M00.0.05 内容复核 accepted；M00.0.04 changes_requested，只剩一处新增兼容性问题。** 因 .05 前置 .04 尚未通过，taskctl 可解锁集合仍为 9，下一项仍是 .04。

## 已完成的复核

- 原有 Python 两组测试实际复跑 168 passed（16.59 秒）。
- 写集 modified=12 / added=9 / missing=0 / outside=0，manifest/result_ref 与成果哈希一致，holdout 未变。
- 原 B4-R1：精确收集生效；同名前缀的未授权文件不再执行，副作用标记不存在。
- 原 B4-R2：混合类型在启动 runner 前 not_run，不能静默漏测。
- 原 B4-R3：负计数和无 testcase 的矛盾报告被拒绝。
- 原 B4-R4：默认工厂和模块 app 已接到环境读取，非法配置在新进程失败；无密钥健康服务和导入不联网回归通过。

## 唯一待修：B4R1-R1

同一测试文件可以合法定义两个 `describe("group")`。独立实际运行 Vitest 5.0.1，两组各一个通过用例：原生退出码 0，success=true，numTotalTestSuites=3（文件根+两组），numTotalTests=2。

两个用例的 ancestorTitles 都是 ["group"]。当前验证器用 set 去重标题路径，只数出 2，然后把真实报告判为 report_corrupt/exit 2。标题不是唯一身份，不能据此精确重建 suite 数。

下一轮仅修此兼容性问题及测试。保留现有白名单、无测试判定、非负计数、用例守恒和失败标志校验；不要以“放过任何 JSON”替代正确边界。对无法从当前扁平报告证明的 suite 身份关系明确记下限制，用原生报告事实支持判定。

M00.0.05 报告/代码/manifest 本轮已通过，下一轮只读，不再返工。混合语言任务仍有意 fail-closed，真实执行前另行扩展。暂不进入 Hermes 或模型调用。

证据：reviews/evidence/BATCH-004-R1/；原提交：reviews/history/BATCH-004-R1/submitted/。当前派工另见 docs/handoff/BATCH-004-R2.md。
