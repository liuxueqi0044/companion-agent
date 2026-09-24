# BATCH-005-R1 · Windows junction 路径预检修订

状态：**submitted，等待交接方独立复核**。只修 B5-R1；M00.3.01 仍是 preflight_only / partial，原 A01–A03 全部 not_run，独立复核前 changes_requested、累计 accepted=11。

- 唯一产品目录：C:\Users\xiayu\Documents\Codex\companion-agent
- 派工：docs/handoff/BATCH-005-R1.md；基线：sha256:919e8db6015e11ff748c6ff7c34e7ac5712760abd81b3c874fb5e27698048df2
- 本卡 result_ref：manifest-sha256:26357320eaeb9cfe670e621607dc9de66bdcb9593d3c4da540da7d887dc85f67
- batch_level_changed_files：reports/BATCH-005-R1.md。本轮卡内改动见 reports/M00.3.01.json 的 changed_files_this_round。

## B5-R1

旧实现只调用 is_symlink；真实 Windows junction 的 is_symlink=False、is_junction=True。R1-pre-fix-junction.txt 记录修复前两个反例：upstream 会在检查前读取夹具仓库外的自有源码，两个不同 home 字符串实际指向同一目录仍通过。

现对 source-index 与全部必需源码路径在读取前逐段 lstat，拒绝 symlink、junction 和其他 reparse point；home/temp_root 同样检查，元数据错误结构化失败，存在的 home 还比较解析后的实际位置。不存在的正常计划 home 仍可通过。这是检查时刻的路径预检，不能代替未来运行时隔离。

真实 junction 定向回归 6 项通过，完整离线测试 23 项通过；正常 --preflight/--plan exit 0，路径越界与未知模式 exit 2，integration_status 一直 not_run。联接只指向本卡 tmp 内自有夹具，先移除链接再清理普通目录；本轮结束 tmp 为空。日志见 reports/evidence/M00.3.01/logs/R1-*。

固定来源和旧日志未变；未安装、运行 Hermes，未读凭据，未调用模型/账号。稳定 NativeRunRef、实际断连/取消语义、只读工具策略与账号/预算仍待后续真实试验。

最终范围检查 exit 0、outside=[]、PASS；三成果 manifest 与 17 个旧上游来源的 hash/bytes 复算通过。taskctl validate exit 0；next --repo . 为 M00.3.01 changes_requested、accepted=11。证据见 reports/evidence/M00.3.01/logs/R1-final-scope.txt、R1-hash-check.txt、R1-taskctl-validate.txt、R1-taskctl-next.txt。提交后停止，不自写 accepted，不开展下一卡。
