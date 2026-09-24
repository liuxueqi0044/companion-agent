# BATCH-004-R2 独立复核通过

M00.0.04 accepted，B4R1-R1 关闭。M00.0.05 原 accepted review/报告/成果未改，前置满足后 taskctl 累计 accepted=11，下一卡 M00.3.01 ready。

- 独立复跑验证器完整单测：94 passed（19.42 秒）。原 Vitest smoke：2 files / 6 passed。
- 独立真实反例：同名兄弟组 3 suites / 2 tests 与嵌套同名组 5 suites / 2 tests，验证器均 passed；空组加正常用例保留原生 failed，没有把失败转成成功。
- 三个夹具均放入未授权同名前缀干扰文件，均未执行；三份篡改计数报告均被拒绝。
- diff 仅将标题集合的错误等式改为有依据的下界，并新增真实回归。非负整数、suite 汇总守恒、用例/文件/状态一致性仍保留。
- 写集 modified=6 / added=8 / missing=0 / outside=[]；两卡 manifest/result_ref 和文件哈希一致；holdout 未变。

限制：扁平 Vitest JSON 不能精确恢复同名/空 suite 的身份数量，不能用它证明报告的完整真实性。三张混合语言任务仍 fail-closed，首次执行前需另行开发 runner 分流。

证据：reviews/evidence/BATCH-004-R2/；原始提交归档：reviews/history/BATCH-004-R2/submitted/。
下一轮 BATCH-005 仅进行 M00.3.01 的源码核对与离线接入准备；真实 Hermes 生命周期、模型运行与账号接入尚未验证，不提前解锁后续依赖。
