# CORE-005 独立复核及架构师补丁

2026-09-24。判定：**accepted_with_architect_fixes（可信本地主动联系执行层）**。

提交代码先独立复核，随后按用户授权直接修正边界。架构师补丁经过自检，不称作另一作者的独立复核。原reports/core-005报告/21项manifest保持submitted历史；原项目accepted数不变。

## 复核结果

提交态scope PASS，21项manifest哈希/字节一致。独立复跑Python121、Node126全部通过；提交文件副本和复核初始基线在reviews/evidence/CORE-005封存。

额外15项反例在提交代码上全部失败（architect-red.txt），集中于三类缺口，已直接修复：

| 编号 | 影响 | 修订 |
| --- | --- | --- |
| AR5-01 | Python和Schema合法的null可选字段被Node拒绝；真实服务send含due_at:null也被标为provider_invalid_output，消耗一次评估却不能送达 | 按FollowUpDecision允许未使用字段null，仍拒绝非空无关字段；真实Node→Python→SQLite回归证明只送达一次 |
| AR5-02 | complete只验证通用plan形状，evaluating/needs_retry或与本次send/defer/cancel相矛盾的状态/原因也可被当作成功；错误sent还进入已发送ID列表 | 在发布前核验decision与业务回执矩阵；非法完成标记unknown，不读取/重放来粉饰成功。只读核对仍能显示合法的评估中/待重试事实 |
| AR5-03 | 共享unknown仅在新任务开始时检查；前台生成中reconcile观察到outcome_unknown后仍accept，联系链在同步回调加入屏障后仍调用provider/complete | 两个runner在provider和普通写操作实际发送前检查共享屏障；迟到输出不继续产生副作用，保留显式窄清理与只读核对 |

补丁改动三个execution文件及frontend-handoff；新增一个architect-regressions测试文件。Python生产、旧测试、Schema、依赖、数据库版本和原工作区未修改。

## 最终验证

- Python121通过：沿用本次提交态独立复跑，Python代码/测试未变。
- Node142通过，0失败/跳过/取消：原126项+16项新回归。新增测试含15个失败反例与一组合法完成分支，防止修复把合理的defer/cancel/context_changed等拒绝掉。
- Schema只读PASS；CORE-002/003/004/005四份离线演示均通过。CORE-005实际最大provider并发1、主动关闭时明确提醒仍送达、重开身份/消息稳定、CSV总额6且有来源。
- 当前22项成果见reports/core-005-architect/final-artifacts.json。历史submitted manifest不能覆盖当前补丁。
- 提交态scope与架构师补丁scope分别封存，不更新旧基线去获得PASS。架构师范围证据为reviews/evidence/CORE-005/architect-scope-final.json。

A01–E03在此本地范围通过，部分最终结论包含架构师补丁。真实模型/HTTP/凭据读取、新会话/子代理、安装、Git/部署、生成页面执行及视觉工作均为0。

## 尚未完成

真实语义和主动联系时机/措辞质量、后台常驻、系统通知、网络重连、原生隔离及产品视觉仍not_run。pulse是可信宿主显式调用，不是自动后台运行；owner/slot仅覆盖同进程同host对象，不能声称跨账号互斥。未知写入不会因一次只读核对自动消除。

证据：scope-submitted、python-submitted、node-submitted、architect-red、node-final、schema-final、demo-002/003/004/005-final、final-command-results、architect-scope-final。
