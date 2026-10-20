// UI copy only. Names, IDs, source provenance, user messages and API enums stay original.
export const ZH_UI: Record<string, string> = Object.fromEntries(`
Enter a positive plain-decimal target rate.|请输入使用普通十进制数字的正目标汇率。
ATM & Alerts requires the live Node backend. No frontend fixtures are used.|ATM 与提醒需要实际 Node 后端，不使用前端示例数据。
Seeded ATM locations, distances and rates are Simulated, not live or based on your device location. Checks do not subscribe to notifications or execute transactions.|ATM 位置、距离与汇率均为预置模拟数据，非实时，也非基于设备位置。检查不会订阅通知或执行交易。
Server-ranked indicative ATM quotes; use Compare for trusted preview and Save.|后端排序的 ATM 参考报价；请在比较页面进行可信预览与保存。
Loading ATM options…|正在加载 ATM 方案…
Refresh ATM options|刷新 ATM 方案
Illustrative pricing target:|示例定价目标：
Funded by MYR Funding; no plan or posting created.|使用马币资金账户；不会创建计划或入账。
No ATM metadata for these inputs. Retry or use Compare; no fixture fallback is used.|这些条件下没有 ATM 元数据。请重试或使用比较页面，不会回退到示例数据。
m away|米（示例距离）
Compatibility|兼容性
unknown|未知
compatible|兼容（仅限预置数据）
incompatible|不兼容（仅限预置数据）
No supporting compatibility evidence.|缺少兼容性证明。
Provider withdrawal guide (original)|服务商取款指南（原文）
Check target rate|检查目标汇率
Checking target rate…|正在检查目标汇率…
Alert me when RM 1 buys at least|当 RM 1 至少可兑换
Seeded rate history chart|预置汇率历史图
Target reached|已达到目标
Target not reached|尚未达到目标
Reference estimate before fees:|手续费前的参考估算：
Provider recommendation (original)|服务商建议（原文）
Item {value} label|项目 {value} 名称
Item {value} quantity|项目 {value} 数量
Item {value} amount ({value} line total)|项目 {value} 金额（{value} 项目总额）
tax ({value})|税费（{value}）
discount ({value})|折扣（{value}）
total ({value})|总额（{value}）
Funding balance at check|检查时资金余额
Principal|本金
Total funding debit|资金账户总扣款
Amount received|到账金额
Projected funding balance|预计资金账户余额
Projected MYR shortfall|预计马币缺口
Maximum safe total MYR debit|安全马币总扣款上限
Funding-account total debit|资金账户总扣款
Actual fee|实际手续费
Money changers & transfer services like Wise|货币兑换商及 Wise 等转账服务
Visa/Mastercard indicative rates + issuer fees|Visa/Mastercard 参考汇率及发卡行手续费
ATM operator fees & foreign-card charges|ATM 运营商手续费及境外卡费用
Action in progress or history unavailable|操作进行中或历史不可用
Already saved|已保存
Preview unavailable|预览不可用
Legacy unlinked|旧记录未关联
Currency exchange|换汇
Shared bill payment|共享账单付款
Shared expense settlement|共享开销还款
Receipt expense|收据开销
resolved; read Home for current status|已处理；请在主页读取当前状态
Agent backend unavailable.|助手后端不可用。
An owned account is unavailable. Refresh Home.|自有账户不可用，请刷新主页。
An owned source/destination account is unavailable. Refresh Home before reviewing completion.|自有付款或到账账户不可用，请刷新主页后再审核完成数据。
Home completion service unavailable.|主页完成确认服务不可用。
Completion is unsupported for this plan objective.|此计划目标暂不支持完成确认。
Manual backend Compare is unavailable in mock mode. Start the live backend and set VITE_USE_MOCK=false.|模拟模式下无法使用后端比较，请启动实际后端并设置 VITE_USE_MOCK=false。
Select a card network, or explicitly choose Unknown.|请选择卡组织，或明确选择未知。
Choose a PNG or JPEG up to 4 MiB.|请选择最大 4 MiB 的 PNG 或 JPEG 图片。
Choose an owned receiving account.|请选择自有收款账户。
Save receipt corrections before requesting allocation.|请求分摊前请先保存收据更正。
Describe how you checked the actual repayment (1–600 characters).|请说明核对实际还款的依据（1 至 600 个字符）。
Recover the pending message/history read before sending a new message.|发送新消息前，请先恢复待处理消息或历史读取。
Enter a MYR amount with at most two decimal places.|请输入最多两位小数的马币金额。
Enter a whole KRW amount.|请输入整数韩元金额。
Enter a positive amount within the supported range.|请输入支持范围内的正金额。
Enter an amount within the supported positive range; fees may be zero.|请输入支持范围内的正金额；手续费可为零。
Supply the actual completion timestamp in ISO format with a timezone.|请使用带时区的 ISO 格式填写实际完成时间。
Allocation validated by Node. Review the trusted shares before explicit confirmation.|Node 已验证分摊，明确确认前请审核可信份额。
Assignments need clarification. No trusted confirmation proposal or financial posting was created.|项目分配需要澄清，未创建可信确认提案或资金记录。
Bill recorded successfully. Do not submit another bill to refresh balances.|账单已成功记录，请勿为了刷新余额再次提交账单。
Bill recorded successfully. Retry-state cleanup unavailable; the original key remains safe to recover.|账单已成功记录。重试状态暂无法清理；仍可用原始键安全恢复。
Choose a different actual receipt. The earlier posting remains in Node history.|请选择另一张实际收据，之前的入账仍保留在 Node 历史中。
Corrections saved as a new version. Earlier proposals are invalid. Assign items again; no financial posting occurred.|更正已保存为新版本，旧提案已失效。请重新分配项目；未发生资金入账。
Extraction is review-only. Sample OCR is Simulated and has not read the image content.|提取仅供审核。OCR 为模拟示例，未读取图片内容。
Completion recorded successfully. Home refreshes are separate reads; do not confirm again.|完成数据已成功记录。主页刷新是独立读取，请勿再次确认。
Enter and explicitly confirm a separate actual repayment.|请填写并明确确认另一笔实际还款。
Message processed. Browser retry-state cleanup failed; identical-key recovery remains safe.|消息已处理。浏览器重试状态清理失败；仍可使用同一键安全恢复。
Message processed. History refresh is unavailable; retry the read, not a new message.|消息已处理。历史刷新不可用；请重试读取，不要另发同一消息。
Node still reports pending at this read. Retry the original confirmation unchanged if needed.|此次 Node 读取仍显示待处理。如需重试，请保持原始确认数据不变。
Pending plan saved successfully. Balances are unchanged; Home reads refresh separately.|待处理计划保存成功，余额未改变；主页将独立刷新。
Pending plan saved successfully. Browser state persistence failed; recover with the same proposal/key if needed. Do not start another Save.|计划保存成功，但浏览器状态保存失败。如需恢复，请使用同一提案与键；不要另建保存请求。
Plan cancelled successfully. Only plan status changed; no financial posting occurred. Home refreshes separately.|计划取消成功，仅状态改变，未发生资金入账。主页将独立刷新。
Repayment recorded successfully. Browser cleanup failed; only retry the retained original request if recovery is necessary.|还款已成功记录，但浏览器状态清理失败。如需恢复，请仅重试保留的原始请求。
Repayment recorded successfully. It clears debt and is never income. Refresh failures cannot undo this posting.|还款记录成功，将减少欠款且不计收入。刷新失败不会撤销入账。
Saved to your pending plans. Balances are unchanged.|已保存至待处理计划，余额未改变。
Shared bill recorded by Node. Home, ledger and risk reads refresh separately.|Node 已记录共享账单，主页、账本与风险将独立刷新。
Status read unavailable. The previous confirmation outcome remains unverified; keep the original retry details.|状态暂时无法读取，之前的确认结果仍未核实。请保留原始重试数据。
Across borders.|跨越国界。
Your money.|你的资金。
Hi {value}|你好，{value}
BorderWise Agent|BorderWise 助手
Option|选项
Live|实时
Unknown|未知
Unknown (legacy record)|未知（旧记录）
Yes|是
No|否
You|你
Available|可用
Provider unavailable|服务不可用
Scripted demo provider — no model call|脚本演示服务，未调用模型
 · Scripted demo| · 脚本演示
 · Server-side model| · 服务端模型
Session ID|会话 ID
Agent session ID|助手会话 ID
Agent message|助手消息
Model provider: {value}|模型服务：{value}
Resume session|恢复会话
New conversation|新建对话
Reload history|重新加载历史
Load more history|加载更多历史
Load more recorded receipts|加载更多已记录收据
Retry session connection|重试会话连接
Retry history read|重试历史读取
Loading session and conversation…|正在加载会话与对话…
Waiting for backend…|正在等待后端…
Send|发送
Details needed|需要补充的信息
Cheapest ₩100,000 cash|最省钱的十万韩元取现
Review pending-plan risks|查看待处理计划风险
Check budget & reserves|查看预算与储备金
I need KRW 100000 cash from an ATM, funded by MYR Funding. Find the lowest total cost.|我需要在 ATM 提取十万韩元现金，使用马币资金账户，寻找总成本最低的选项。
Read current pending-plan risks and reserve assessments.|请查看当前待处理计划的风险与储备金评估。
Read my current balances and budget reserves.|请查看当前余额、预算与储备金。
Read the selected receipt review and identify anything requiring user review.|请读取所选收据，指出需要用户审核的内容。
Preview the selected option.|请预览所选方案。
Chat reads and previews only. Save and completion require explicit buttons. Quotes remain Simulated even when the model is real.|聊天仅能读取和预览。保存和完成必须点击明确按钮。即使使用真实模型，报价仍是模拟数据。
Ask about balances, reserves, pending-plan risks or supported currency/ATM options.|可询问余额、储备金、待处理计划风险或支持的换汇及 ATM 选项。
The connected Agent requires the Node backend in live mode. No scripted replies or financial writes are available in mock mode.|助手需要连接实际 Node 后端。模拟模式下不提供此助手回复或资金写入。
History read unavailable. Previous cards are historical snapshots; recover the read before starting a new action.|历史暂时无法读取。旧卡片是历史快照；请先恢复读取，再开始新操作。
Historical service cards; re-preview before acting|历史服务卡片；操作前请重新预览
Message outcome needs recovery|需要恢复消息结果
The exact submitted message/key is retained. Retrying cannot create another turn for that key.|已保留原始消息与请求键。使用同一键重试不会产生另一轮消息。
Retry original message|重试原始消息
Request provider again (new turn)|重新请求服务（新一轮）
 — wait before requesting a new provider attempt.|，请稍候再重新请求模型服务。
Submitted Save needs recovery|需要恢复已提交的保存请求
Recover submitted Save|恢复已提交的保存
. Retry the original Save, even if history is unavailable.|。即使历史不可用，也应重试原始保存请求。
Trusted proposal|可信提案
Preview trusted proposal|预览可信提案
Review trusted proposal|审核可信提案
Review trusted Agent proposal|审核助手可信提案
Request selected-option preview|请求所选方案预览
Review completion actuals|审核实际完成数据
Saved pending plan ·|已保存待处理计划 ·
Saved plan|已保存计划
; no second Save is offered.|；不会再次提供保存操作。
Node reports|Node 返回的状态：
Saved quote:|已保存报价：
· snapshot|· 快照
· Seeded quotes remain Simulated.|· 预置报价仍为模拟数据。
Backend marks this historical proposal stale. A current preview is required.|后端已标记此历史提案过期，需要重新获取预览。
Backend reserve warning (snapshot). Preview current values before Save.|后端储备金警告（快照）。保存前请预览当前数值。
Existing balance ·|已有余额 ·
More plans are available on Home.|可在主页查看其他计划。
More ledger entries are available on Home.|可在主页查看其他账本记录。
No plans in this read.|此次读取没有计划。
No ledger entries in this read.|此次读取没有账本记录。
Change the request or retry when the service is available; no fixture fallback is used.|请修改请求或在服务恢复后重试；不会回退到示例数据。
Unsupported card. No financial action was taken. Use a supported explicit review workflow.|暂不支持此卡片。未执行资金操作，请使用支持的明确审核流程。
Current recorded MYR budget|当前已记录马币预算
Actual recorded MYR budget:|实际已记录马币预算：
Last successfully read MYR budget|上次成功读取的马币预算
Available above reserve|储备金以上可用资金
Available above reserve:|储备金以上可用资金：
MYR Funding only. KRW balances and pending-plan forecasts are separate; currencies are not converted or combined.|仅计算马币资金账户。韩元余额与待处理计划预测分开显示，不换算或合并货币。
Stated budget & reserves|已设预算与储备金
Total stated reserve|已设储备金总额
Current reserve shortfall|当前储备金缺口
Current MYR shortfall|当前马币缺口
Maximum safe total MYR debit (Node)|安全马币总扣款上限（Node）
KRW balances are separate; this is not a forecast.|韩元余额单独显示，此处不是预测。
Your stated allocations — recorded values, not verified bank data|你设定的分配：记录值，并非经银行核实的数据
Category colours only; not a calculated allocation chart.|颜色仅区分类别，并非计算得出的分配图。
Pending-plan forecast|待处理计划预测
Pending-plan forecasts — separate from actual budget|待处理计划预测，与实际预算分开
A projection for each plan independently — not the actual current budget|每个计划单独预测，并非当前实际预算
No pending-plan assessments on this page.|此页没有待处理计划评估。
No pending plans on this page. Pick an option in Compare.|此页没有待处理计划。可在比较页面选择方案。
Historical saved quotes; no funds are reserved until actual completion is recorded|历史已保存报价；记录实际完成前不会预留资金
Reserve warning acknowledged when saved (historical).|保存时已确认储备金警告（历史记录）。
Confirmed ledger|已确认账本
No confirmed ledger entries on this page.|此页没有已确认账本记录。
Load more pending plans|加载更多待处理计划
Load more ledger entries|加载更多账本记录
Load more assessments|加载更多评估
Load more current assessments|加载更多当前评估
Refresh Home reads|刷新主页数据
Loading authoritative records…|正在加载权威记录…
Loading…|正在加载…
Read unavailable. Showing the last successful snapshot. Refresh reads; do not repeat a successful financial confirmation.|读取不可用，正在显示上次成功的快照。请刷新读取，不要重复已经成功的资金确认。
Read unavailable. Retry this read; no missing values are assumed to be zero.|读取不可用，请重试；缺失数值不会被当作零。
Refreshing read — previous snapshot remains below.|正在刷新，下方保留上次快照。
Authoritative Home requires the Node backend. Explicit mock mode is not connected to financial confirmation. Start Node and select live API mode.|权威主页需要 Node 后端。模拟模式未连接资金确认，请启动 Node 并选择实际 API 模式。
Completion unavailable for this objective or missing owned account. No substitute posting is supported.|此目标或缺失的自有账户不支持完成确认，不会使用替代入账。
Cancelling…|正在取消…
Account read unavailable.|账户暂时无法读取。
Current Node read|当前 Node 读取结果
Historical model-selected assessment page|模型先前选择的评估页
Forecast MYR reserve shortfall|预计马币储备金缺口
Forecast MYR shortfall|预计马币缺口
Forecast fee-account MYR shortfall|手续费账户预计马币缺口
Forecast separate-account MYR shortfall|独立账户预计马币缺口
Forecast account deficit · {value}|预计账户资金不足 · {value}
Forecast deficit ·|预计资金不足 ·
Refresh current assessments|刷新当前评估
Reading current risks…|正在读取当前风险…
Pagination could not be continued safely. Node restarted from the first page; the figures below are service results. (|无法安全继续翻页。Node 已从第一页重新读取；下方数值来自服务。（
No assessments on this page. This page may skip earlier plans; refresh current assessments from the beginning before concluding there is no pending risk.|此页没有评估，可能跳过了较早计划。请从第一页刷新，再判断是否存在待处理计划风险。
Read failed; any values above are the previous snapshot. No financial action should be retried.|读取失败，上方数值仍是旧快照。请勿因此重试资金操作。
This is an unavailable read, not proof that there is no risk.|读取不可用不代表没有风险。
· assessed|· 评估时间
Backend ranking · Simulated seeded pricing, not live market quotes|后端排序 · 模拟预置价格，非实时市场报价
Choose your inputs, then compare. No prices are calculated in this screen.|选择输入后进行比较，此页面不自行计算价格。
Funding source|资金来源
Card network|卡组织
Select network|选择卡组织
Compare amount|比较金额
Compare options|比较方案
Comparing…|正在比较…
Loading backend options…|正在加载后端方案…
Retry Compare|重试比较
No options for these inputs. Change the amount or network and compare again.|这些条件下没有方案，请修改金额或卡组织后重新比较。
Card-purchase comparison and plans are unsupported by the integrated backend.|集成后端暂不支持刷卡消费比较及计划。
Ranked by most KRW received after all fees.|按扣除全部手续费后实收韩元最多排序。
Ranked by lowest total MYR cost including fees.|按包含手续费的马币总成本最低排序。
I have RM|我的马币预算为 RM
I need ₩|我的韩元目标为 ₩
Principal:|本金：
Review pending plan|审核待处理计划
Loading current proposal preview…|正在加载当前提案预览…
Save records a pending plan. It does not reserve funds, change balances or post ledger activity.|保存仅记录待处理计划，不预留资金、不改变余额，也不写入账本。
Save pending plan|保存待处理计划
Saving…|正在保存…
Retry Save|重试保存
Retry original Save|重试原始保存
Retry preview|重试预览
Close review|关闭审核
I acknowledge this reserve warning for the displayed amounts.|我确认已阅读所显示金额的储备金警告。
I acknowledge the current Node reserve warning.|我确认当前 Node 储备金警告。
I acknowledge this current Node reserve warning.|我确认此当前 Node 储备金警告。
Compare revised budget (|比较修改后的预算（
This preview breaches the stated reserve. Saving requires explicit acknowledgement after a fresh preview. It cannot override insufficient funds.|此预览会动用已设储备金。重新预览并明确确认后才能保存；该确认无法覆盖资金不足。
A Save was submitted. Retry its original token/acknowledgement; refreshing history does not create a new Save intent.|保存请求已提交，请使用原始令牌及确认重试。刷新历史不会产生新的保存意图。
Save creates a pending plan only. Chat and preview cannot debit accounts.|保存仅创建待处理计划。聊天和预览不能扣款。
Historical until re-previewed. No funds reserved or financial activity posted.|重新预览前仅为历史记录，未预留资金或入账。
Node financial preview|Node 资金预览
Current balance|当前余额
Projected balance|预计余额
Projected MYR balance|预计马币余额
Projected reserve shortfall|预计储备金缺口
MYR reserve impact (Node)|马币储备金影响（Node）
MYR reserve check|马币储备金检查
MYR reserve check is not applicable to these accounts.|这些账户不适用马币储备金检查。
Node completion preview — no posting yet|Node 完成预览，尚未入账
Node preview reviewed before submission|提交前已审核的 Node 预览
Did you complete this?|你完成这笔交易了吗？
Record activity completed elsewhere. Quote values are prefilled for review, not proof of actual payment.|记录已在其他地方完成的交易。预填报价仅供审核，不代表已实际付款。
Funding account debited|实际扣款账户
Receiving account|到账账户
Actual principal ({value})|实际本金（{value}）
Actual amount received ({value})|实际到账金额（{value}）
Actual completion timestamp (ISO with timezone)|实际完成时间（含时区的 ISO 格式）
Actual fees|实际手续费
No fees|无手续费
Add actual fee|添加实际手续费
Remove fee|移除手续费
Fee {value} label|手续费 {value} 名称
Fee {value} amount ({value})|手续费 {value} 金额（{value}）
Fee|手续费
Fee breakdown changed:|手续费明细已改变：
Differences from saved quote (Node)|与已保存报价的差异（Node）
Original|原始
Actual|实际
Quoted|报价
Quoted fees|报价手续费
Actual debit|实际扣款
Actual credit|实际到账
Difference:|差额：
Currency changed; no converted difference.|货币已改变，不提供换算差额。
Funding:|资金来源：
Destination:|目标账户：
Preview completion|预览完成结果
Checking actuals…|正在检查实际数据…
Only explicit confirmation posts actual principal and separate fee entries. It does not execute a bank transaction.|只有明确确认才会记录实际本金及独立手续费，不会执行银行交易。
I confirm these actual amounts, accounts and time describe activity completed elsewhere.|我确认这些实际金额、账户和时间对应已在其他地方完成的交易。
Actual figures would breach the stated MYR reserve. Acknowledge this current Node warning; it cannot override insufficient funds.|实际数值将动用已设马币储备金。请确认此 Node 警告；该确认不能覆盖资金不足。
Recording…|正在记录…
Retry original confirmation|重试原始确认
Check recorded status|检查已记录状态
Close and refresh Home|关闭并刷新主页
A confirmation was submitted. Keep these exact details for retries or check Node status. Closing does not undo a recorded activity.|确认请求已提交。重试时请保留原始数据，或检查 Node 状态。关闭不会撤销已记录的交易。
Checking your plan…|正在检查计划…
Running the fee-aware budget check.|正在进行包含手续费的预算检查。
Total debit including fees takes your balance below your|包含手续费的总扣款将使余额低于你的
stated reserve|已设储备金
below your stated reserve|低于已设储备金
Reduce to safe amount (|减少至安全金额（
exchange)|换汇）
To change the amount, ask for a new quote — plans are never edited in place.|如需修改金额，请请求新报价；不会直接编辑计划。
Upload / resume receipt|上传或继续审核收据
Upload a new receipt|上传新收据
Resume receipt review|继续审核收据
Retry receipt session connection|重试收据会话连接
Split requires the connected Node backend. Financial actions are unavailable in mock mode.|分账需要连接 Node 后端，模拟模式不提供资金操作。
Node ledger is authoritative. Original debts and actual repayments retain their own currencies. OCR currently returns Simulated sample output.|Node 账本为权威记录。原始欠款与实际还款保留各自货币。OCR 目前返回模拟示例。
Upload privately, correct the sample extraction, assign items, then explicitly confirm a trusted allocation.|私密上传收据，更正示例提取数据、分配项目，再明确确认可信分摊结果。
Receipt review|收据审核
Receipt image|收据图片
Receipt date|收据日期
Merchant|商户
Upload and extract receipt|上传并提取收据
Retry extraction of uploaded image|重试提取已上传图片
Waiting for receipt service…|正在等待收据服务…
Receipt review needs the connected Node backend.|收据审核需要连接 Node 后端。
Node is the sole financial writer. Upload, edits and allocation never post money. Current OCR returns Simulated sample output, regardless of the uploaded image.|仅 Node 可写入资金记录。上传、编辑和分配不会入账。无论上传何种图片，当前 OCR 都返回模拟示例。
Private image; PNG/JPEG, at most 4 MiB. A lost upload response can require uploading again; no bill is posted.|私密图片，PNG/JPEG，最大 4 MiB。上传响应丢失可能需要重新上传；不会因此记录账单。
Refresh current receipt (discard unsaved edits)|刷新当前收据（放弃未保存修改）
Original extraction · immutable|原始提取，保留且不可更改
Original items and source|原始项目与来源
Editable receipt · version|可编辑收据 · 版本
Supplied confidence:|服务提供的置信度：
Save receipt corrections|保存收据更正
Item|项目
Tax|税费
tax|税费
discount|折扣
total|总额
label|名称
quantity|数量
amount|金额
Total|总额
Participants and item assignments|参与者与项目分配
Current user pays. Choose stable IDs, including every person who shared an item. Blank assignments require review; no names are inferred.|当前用户付款。使用稳定 ID 选择每个项目的参与者。未分配项目需要审核，不会根据姓名猜测身份。
Actual paying account|实际付款账户
Actual bill payment timestamp (ISO timezone)|账单实际付款时间（含时区的 ISO 格式）
Same-currency bill/payment only. Existing payment linking and other payers are unsupported. Check the actual timestamp.|仅支持账单与付款同币种。暂不支持关联已有付款或其他付款人。请核对实际时间。
Request allocation preview|请求分摊预览
Trusted allocation · version|可信分摊 · 版本
Proposal|提案
Node reconciliation:|Node 核对结果：
. Account|。账户
; paid at|；付款时间
· payer|· 付款人
This proposal is stale. Refresh the receipt and allocate the current version.|此提案已过期，请刷新收据并重新分配当前版本。
Local inputs differ from this allocation. Save corrections and request a new allocation before confirming.|本地输入与此分摊不同。确认前请保存更正并重新请求分摊。
I reviewed the receipt and original provenance|我已审核收据及原始来源
I confirm assignments, payer, account and actual payment time|我确认项目分配、付款人、账户与实际付款时间
Explicit confirmation records the full bill debit once and creates linked receivables. This records an actual payment; it does not execute a payment.|明确确认将一次性记录整笔账单扣款，并创建关联应收款。这仅记录实际付款，不执行付款。
Confirm reviewed bill|确认已审核账单
Confirmation outcome needs recovery. The exact proposal, version, acknowledgements and request key are retained. Retry only the original confirmation.|需要恢复确认结果。已保留原始提案、版本、确认与请求键，请仅重试原始确认。
Retry original bill confirmation|重试原始账单确认
Start a new receipt|开始另一张收据
Ask Agent to read this receipt|请助手读取此收据
Receipt review · historical version|收据审核 · 历史版本
Extraction is unconfirmed. Open the current version before editing or allocating.|提取结果尚未确认，编辑或分配前请打开当前版本。
Open receipt review|打开收据审核
Allocation review ·|分摊审核 ·
Review current allocation|审核当前分摊
No financial action is taken by chat.|聊天不会执行资金操作。
Retry receipt review when the service recovers; no financial posting occurred.|请在服务恢复后重试收据审核；未发生资金入账。
Selected receipt|已选择收据
. Messages review this receipt; chat never confirms it.|。消息仅审核此收据，聊天不能确认入账。
Clear receipt context|清除所选收据
Committed receipt history · Node|已入账收据历史 · Node
Shared expense recorded by Node|Node 已记录共享开销
Full bill debit|整笔账单扣款
Personal expense|个人开销
Authoritative receivables|权威应收款
Recorded once. Refresh Home and Split reads separately.|已记录一次，请分别刷新主页与分账数据。
Activity|交易记录
Debt status|欠款状态
All debts|全部欠款
Outstanding|未结清
Settled|已结清
Cleared:|已结清：
Loading authoritative receivables…|正在加载权威应收款…
Refresh receivables|刷新应收款
No debts in this view.|此视图没有欠款。
owes|欠款
· cleared|· 已结清
Legacy unlinked debt; no participant identity is inferred.|未关联身份的旧欠款，不会推断参与者身份。
Participant {value} · split {value}|参与者 {value} · 分账 {value}
Record repayment / history|记录还款或查看历史
View repayment history|查看还款历史
Repayment & history|还款与历史
Original debt:|原始欠款：
Outstanding (Node):|未结清金额（Node）：
Receivable|应收款
Refresh debt and history|刷新欠款与历史
Enter two independent actual amounts. No indicative FX is used. Fees and FX snapshots are unsupported here.|请独立输入两个实际金额，不使用参考汇率。此处暂不支持手续费或汇率快照。
Original debt to clear ({value})|本次结清原始欠款（{value}）
Owned receiving account|自有收款账户
Choose account|选择账户
Actual repayment received ({value})|实际收到的还款（{value}）
choose account|先选择账户
Actual repayment timestamp (ISO timezone)|实际还款时间（含时区的 ISO 格式）
Repayment evidence / source|还款依据或来源
Repayment credits the selected account and reduces original debt. It never debits the original bill or creates income. Same-currency principal amounts must match; Node validates all amounts.|还款增加所选账户余额并减少原始欠款，不再次扣除账单，也不计为收入。同币种本金必须一致；所有金额由 Node 验证。
I checked the actual repayment and confirm these independent amounts|我已核对实际还款，并确认这两个独立金额
Confirm actual repayment|确认实际还款
Waiting for Node…|正在等待 Node…
Outcome uncertain. Inputs are locked and the exact original request/key is retained across reloads. Do not start another repayment.|结果尚不确定。输入已锁定，刷新后仍保留原始请求与键。请勿另建一笔还款。
Clear|结清
; received|；实收
into|存入
Retry original repayment|重试原始还款
Repayment recorded once|还款已记录一次
Outstanding at this posting:|此笔入账后的未结清金额：
Posting succeeded; optional current-state read unavailable. Retry the read only.|入账成功，但当前状态暂时无法读取。请仅重试读取。
Record another repayment|记录另一笔实际还款
Authoritative settlement history|权威还款历史
No repayments recorded.|尚无还款记录。
Original debt cleared:|已结清原始欠款：
Actual received:|实际收到：
Received:|收到时间：
Recorded:|记录时间：
Settlement|还款记录
Load more repayments|加载更多还款
Load more receivables|加载更多应收款
· ledger|· 账本
· participant|· 参与者
· split|· 分账
· version|· 版本
· discount|· 折扣
account|账户
ATM withdrawal|ATM 取现
 (separate debit)|（独立扣款）
pending|待处理
completed|已完成
cancelled|已取消
open|未还款
partial|部分结清
settled|已结清
review_required|待审核
clarification_required|待澄清
confirmed|已确认
stale|已过期
validated|已验证
not_calculated|尚未计算
ok|正常
unsupported|暂不支持
unavailable|不可用
provider_error|服务错误
income|收入
expense|支出
shared_expense|共享开销
exchange|换汇
atm_withdrawal|ATM 取现
fee|手续费
settlement|还款
Above reserve|高于储备金
At reserve|等于储备金
Below reserve|低于储备金
Within reserve|储备金充足
Would breach reserve|预计动用储备金
Insufficient tracked funds|已记录资金不足
Reserve check not applicable|不适用储备金检查
Cannot assess|无法评估
KRW Card|韩元卡
KRW Cash|韩元现金
MYR Funding|马币资金
`.trim().split('\n').map(line => line.split('|')))
