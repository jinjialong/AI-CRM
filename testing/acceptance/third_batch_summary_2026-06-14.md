# Third Batch AI Assistant Test Summary - 2026-06-14

Source document: `docs/1.2/1.2测试/1.2测试-AI助手测试用例集.md`

Scope: document section `4.3 第三批`, 23 cases.

## Result
- Passed / acceptable: 14
- Failed / abnormal: 9

## Main Failures
- `CL-14`: invalid phone `12345` was accepted and created lead `#36`.
- `CU-06`: "查一个不存在的客户" returned all visible customers instead of an empty result.
- `CV-03`: with `context.lead_id=35`, "这条线索帮我转一下客户" asked for a lead ID instead of returning `draft_action`.
- `CV-09`: converted lead `#34` still returned a new `draft_action` instead of failing early.
- `CF-02`: "跟进方式有哪些" returned generic chat text instead of structured `followup_methods`.
- `CF-03`: "线索来源配置是什么" was routed as config-related but did not reliably return structured config data.
- `RW-01`: vague company phrase "华南那家公司" was written as a real company name in lead `#38`.
- `RW-03`: typo-like "帮我转客户3" hit conversion permission logic and returned HTTP `403`.
- `RW-04`: phone-only customer lookup returned all visible customers instead of a filtered/empty result.

## Data Created
- `#36` 晨星科技 / phone `12345` - invalid phone accepted.
- `#37` 蓝海智能 / phone `13800000010`.
- `#38` 华南那家公司 / phone `13900000011` - vague company name accepted.
- `#39` 蓝海智能 / phone `13800000012`.
- `#40` Nova Tech / phone `13800000014`.

## Notable Passes
- `CL-15`, `RW-02`, `RW-06`: long/mixed input could create leads without crashing.
- `CV-11`: unsupported confirm action returned failure.
- `CH-02` to `CH-05`: non-CRM/dirty/empty inputs did not write business data.
- `RW-07`, `RW-08`: multi-turn capability switching did not create unintended leads.
- `MO-03`: context transfer phrase "把这条线索转成客户" returned fallback `draft_action` without writing.
- `MO-04`: ordinary chat did not write data.
- `MO-05`: unauthorized conversion returned `403` and audit contained failed action `AI-149`.
