Được. Mình sẽ xem đây như kế hoạch nâng cấp từ **Membership demo board** thành **Portaldot Visual Contract Workflow Workbench**. Trọng tâm không phải nhồi thật nhiều node, mà là làm cho workflow **đúng logic, khó đi sai flow, dễ debug, và thật sự hữu ích cho dev blockchain**.

**Mục Tiêu Sản Phẩm**

Xây dựng một visual board giúp dev Portaldot làm các việc sau theo workflow rõ ràng:

```txt
Check environment
-> Build contract
-> Load artifacts
-> Deploy / attach contract
-> Read state
-> Send transaction
-> Inspect events/logs
-> Debug lỗi
-> Save/share workflow
```

Membership chỉ là **template mẫu đầu tiên**, không phải giới hạn của tool.

---

**Nguyên Tắc Không Được Sai**

1. Không cho node chạy nếu dependency chưa sẵn sàng.
2. Không hardcode mọi thứ vào Membership.
3. Không tự động gửi transaction tốn token mà không cảnh báo.
4. Không để lỗi blockchain hiện ra như stack trace khó hiểu.
5. Không để contract address cũ bị hiểu nhầm là contract live.
6. Không để workflow chạy tiếp sau khi node quan trọng fail.
7. Không trộn read query và write transaction thành cùng một hành vi.
8. Không để board đẹp nhưng trạng thái thật của chain sai.
9. Không giấu gas/value/balance khi chạy write transaction.
10. Không làm generic quá sớm nếu chưa validate được bằng template thật.

---

**Kiến Trúc Workflow Cần Có**

Mỗi node phải có contract rõ ràng:

```ts
type NodeStatus =
  | "idle"
  | "blocked"
  | "ready"
  | "running"
  | "success"
  | "warning"
  | "error";

type WorkflowNode = {
  id: string;
  kind: string;
  label: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  dependsOn: string[];
  status: NodeStatus;
  lastRun?: {
    startedAt: string;
    endedAt?: string;
    ok: boolean;
    stdout?: string;
    stderr?: string;
    errorCode?: string;
    hints?: string[];
  };
};
```

Quan trọng nhất là **output passing**:

```txt
Connect RPC outputs endpoint, rpcReachable, runtimeInfo
Load Artifact outputs metadataPath, wasmPath, messages
Deploy Contract outputs contractAddress, extrinsicHash
Read Message outputs decodedValue
Call Message outputs extrinsicHash, events
```

Node sau không nên tự đoán dữ liệu. Nó phải lấy từ output node trước hoặc user nhập có validate.

---

**Phase 1: Workflow Engine Vững Trước**

Trước khi thêm nhiều tính năng, phải làm engine chắc.

Cần làm:

1. Tạo dependency resolver cho node.
2. Tạo trạng thái `blocked` nếu thiếu input hoặc node trước fail.
3. Tạo `Run selected node`.
4. Tạo `Run from this node`.
5. Tạo `Run full workflow`.
6. Khi chạy full workflow, dừng ở node lỗi đầu tiên.
7. Mỗi node có `preflightValidate()`.
8. Mỗi node có `execute()`.
9. Mỗi node có `postValidate()`.

Ví dụ logic:

```txt
Before Deploy Contract:
- RPC online?
- metadata exists?
- wasm exists?
- account balance enough?
- constructor selected?
- value/endowment valid?

If no:
- status = blocked
- show warning
- do not execute script
```

Cần lưu ý:

```txt
blocked != error
```

`blocked` nghĩa là chưa đủ điều kiện.  
`error` nghĩa là đã chạy và fail.

Đây là khác biệt rất quan trọng để UX chuyên nghiệp.

---

**Phase 2: Chuẩn Hóa Node Types**

Nên chia node thành 4 nhóm.

**Environment Nodes**

```txt
Connect RPC
Check Runtime
Check Account
Check Balance
```

`Connect RPC`

Input:

```txt
endpoint
```

Validate:

```txt
endpoint phải là ws:// hoặc wss://
local mode thì nên là ws://127.0.0.1:9944
không cho endpoint rỗng
```

Output:

```txt
rpcReachable
chainName
runtimeVersion
contractsPalletAvailable
```

Warning cần có:

```txt
RPC offline
Wrong endpoint format
Connected but Contracts pallet not found
Connected to non-local endpoint
```

`Check Account`

Input:

```txt
seed hoặc selected account
ss58 format
```

Output:

```txt
address
nonce
```

Warning:

```txt
Invalid seed
No account selected
SS58 mismatch
```

`Check Balance`

Input:

```txt
address
endpoint
```

Output:

```txt
freeBalance
tokenSymbol
tokenDecimals
canPayFees
```

Warning:

```txt
Balance too low for deployment
Balance too low for contract call
```

---

**Contract Lifecycle Nodes**

```txt
Build Contract
Load Artifact
Deploy Contract
Attach Existing Contract
Verify Contract Live
```

`Build Contract`

Input:

```txt
contract directory
build mode: debug/release
```

Execute:

```txt
cargo contract build --release
```

Output:

```txt
metadataPath
wasmPath
contractBundlePath
buildLog
```

Warning:

```txt
cargo not found
cargo-contract missing
wasm target missing
build failed
metadata not generated
```

Cần lưu ý:

Build có thể lâu. UI phải có running state và log streaming hoặc log refresh.

`Load Artifact`

Input:

```txt
metadata JSON path
wasm path
```

Validate:

```txt
file exists
metadata parse được
metadata có messages
wasm file không rỗng
```

Output:

```txt
contractName
constructors
messages
events
metadataVersion
inkVersion
```

Đây là node cực kỳ quan trọng để thoát khỏi hardcode Membership.

`Deploy Contract`

Input:

```txt
endpoint
account
metadataPath
wasmPath
constructor
constructorArgs
endowment/value
gas config
```

Validate:

```txt
RPC online
artifact ready
constructor tồn tại trong metadata
args hợp lệ theo type
balance đủ
```

Warning modal trước khi chạy:

```txt
You are about to deploy a contract.
This will submit a transaction and spend fees.
Endpoint: ...
Account: ...
Constructor: ...
Value/Endowment: ...
```

Output:

```txt
contractAddress
extrinsicHash
blockHash
deployEvents
```

`Attach Existing Contract`

Input:

```txt
contractAddress
metadataPath
endpoint
```

Validate:

```txt
address không rỗng
query Contracts.ContractInfoOf(address)
metadata compatible
```

Output:

```txt
contractAddress
contractReachable
```

Warning:

```txt
Address exists but metadata may not match
Address stale / not found on current chain
```

---

**Interaction Nodes**

```txt
Read Message
Call Message
Watch Events
Decode Events
```

`Read Message`

Input:

```txt
contractAddress
metadata
message
args
caller
```

Validate:

```txt
message là read-compatible
contract live
args đúng kiểu
```

Output:

```txt
decodedResult
gasRequired
debugMessage
```

Không cần warning modal lớn vì read query không gửi transaction.

`Call Message`

Input:

```txt
contractAddress
metadata
message
args
caller
value
gas
```

Validate:

```txt
message tồn tại
contract live
balance đủ
value hợp lệ
dry-run pass nếu có thể
```

Warning modal bắt buộc:

```txt
You are about to submit a transaction.
Message: join(...)
Value: ...
Estimated gas: ...
Account: ...
```

Output:

```txt
extrinsicHash
events
contractEvents
decodedResult
```

Nếu dry-run fail, không nên submit thật trừ khi user bật advanced override.

`Watch Events`

Input:

```txt
contractAddress
event names
from latest block hoặc known block
```

Output:

```txt
eventTimeline
```

Cần hiển thị:

```txt
Contracts.Instantiated
Contracts.ContractEmitted
Contracts.Called
System.ExtrinsicSuccess
System.ExtrinsicFailed
TransactionPayment.TransactionFeePaid
```

---

**Utility Nodes**

```txt
Export Workflow
Export Commands
Save Workflow
Load Workflow
Generate Report
```

`Save Workflow`

Lưu:

```txt
nodes
edges
node configs
selected template
last outputs optional
```

Không nên lưu secret seed mặc định.

Warning:

```txt
Do not export private seed phrase.
```

`Export Commands`

Sinh command tương ứng:

```txt
python scripts/doctor.py
cargo contract build --release
python scripts/deploy.py ...
python scripts/call.py ...
```

Tính năng này rất hữu ích cho dev vì visual board không khóa họ trong UI.

---

**Phase 3: Validation Logic Giữa Các Node**

Cần có một bảng rule rõ ràng.

Ví dụ:

| Node | Bắt buộc trước đó | Nếu thiếu thì |
|---|---|---|
| Check Balance | Connect RPC + Account | blocked |
| Build Contract | local project path | warning nếu path sai |
| Load Artifact | Build Contract hoặc file paths | blocked |
| Deploy Contract | RPC + Account + Balance + Artifact | blocked |
| Attach Contract | RPC + Metadata + Address | warning/stale |
| Read Message | RPC + Contract live + Metadata | blocked |
| Call Message | RPC + Contract live + Metadata + Balance | confirmation modal |
| Watch Events | RPC + Contract live | warning nếu chưa có address |
| Export Workflow | none | success |

Preflight message phải cụ thể:

Không nên:

```txt
Cannot run node
```

Nên:

```txt
Deploy Contract is blocked because:
- RPC endpoint is offline
- Metadata JSON is missing
- Account balance could not be read
```

---

**Phase 4: Warning Modal Và Error Guidance**

Cần 3 loại thông báo.

**Inline Warning**

Dùng cho lỗi nhẹ hoặc trạng thái thiếu:

```txt
RPC offline
Artifact missing
Contract address stale
```

**Blocking Modal**

Dùng khi user cố chạy node sai flow:

```txt
Deploy Contract cannot run yet.
Complete these steps first:
1. Connect RPC
2. Load Artifact
3. Check Balance
```

**Transaction Confirmation Modal**

Dùng trước write action:

```txt
This action will submit a transaction.
Network: local
Account: Alice
Contract: 5G...
Message: join
Value: 1 POT
```

Các lỗi phổ biến cần map thành hint:

```txt
ECONNREFUSED
-> Local chain is not running. Start the node at ws://127.0.0.1:9944.

ContractInfoOf none
-> This contract address is stale. Deploy again or attach a valid address.

metadata missing
-> Build contract first with cargo contract build --release.

insufficient balance
-> Fund this account before deploying or calling contract.

already a member
-> This account already joined. Continue to read state.

dry-run gas unavailable
-> Runtime dry-run API is unavailable. Use fallback gas settings or advanced mode.

ExtrinsicFailed
-> Show module, error, docs if available.
```

---

**Phase 5: Metadata-Driven Forms**

Đây là phần biến tool thành generic.

Khi load metadata, UI cần sinh form cho:

```txt
constructors
messages
args
events
```

Ví dụ metadata có message:

```txt
transfer(to: AccountId, amount: Balance)
```

UI sinh:

```txt
to: address input
amount: numeric input
```

Type handling ban đầu nên hỗ trợ các type phổ biến:

```txt
bool
u8/u16/u32/u64/u128
Balance
AccountId
String
Vec<u8>
Option<T>
```

Không cần hỗ trợ mọi type phức tạp ngay. Nếu gặp type chưa support:

```txt
Show advanced JSON input
Warn user that type is not fully supported
```

---

**Phase 6: UX Trên Visual Board**

Board nên có các vùng rõ ràng:

```txt
Canvas: nodes + edges
Inspector: config selected node
Health strip: RPC / Artifact / Contract / Account
Run panel: logs + current execution
Event panel: decoded timeline
```

Node nên hiển thị:

```txt
status color
short output
last run time
blocked reason count
```

Ví dụ node card:

```txt
Deploy Contract
Status: blocked
Missing: artifact, balance
```

Không cần user mở inspector mới biết vì sao node không chạy.

---

**Phase 7: Template Workflows**

Nên có nhiều template thay vì để user tự tạo từ số 0.

Template 1:

```txt
Membership Starter
Connect -> Balance -> Load Artifact -> Deploy -> Read is_member -> Call join -> Read is_member -> Watch Events
```

Template 2:

```txt
Deploy Any Contract
Connect -> Build -> Load Artifact -> Deploy -> Attach -> Inspect Messages
```

Template 3:

```txt
Read Existing Contract
Connect -> Load Metadata -> Attach Contract -> Read Message -> Watch Events
```

Template 4:

```txt
Debug Local Chain
Connect -> Check Runtime -> Check Account -> Check Balance -> Verify Contract
```

Hackathon demo nên dùng Template 1, nhưng cho thấy Template 2/3 tồn tại để chứng minh tính mở rộng.

---

**Phase 8: Thứ Tự Triển Khai Khuyến Nghị**

Làm theo thứ tự này để ít sai nhất:

1. Refactor node model: `inputs`, `outputs`, `status`, `dependsOn`.
2. Viết `validateNode(node, context)`.
3. Viết `runNode(node, context)`.
4. Viết `runWorkflow()` dừng đúng khi fail.
5. Tách Membership node thành generic `Read Message` và `Call Message`.
6. Thêm `Load Artifact` đọc metadata.
7. Thêm form chọn message từ metadata.
8. Thêm `Build Contract`.
9. Thêm modal confirm cho deploy/call.
10. Thêm error mapper/hints.
11. Thêm save/load workflow JSON.
12. Thêm export commands/report.
13. Polish UI board, inspector, logs.
14. Test full flow nhiều lần với local chain restart.

---

**Checklist Test Bắt Buộc**

Trước khi coi là xong, phải test các case này:

```txt
RPC offline -> board báo offline, deploy/call bị blocked
RPC online -> health update đúng
Artifact missing -> deploy blocked
Build success -> artifact ready
Deploy success -> contract live
Restart --tmp chain -> contract stale
Attach wrong address -> warning
Read before deploy -> blocked
Call before deploy -> blocked
Call with low balance -> warning/error
Call already joined -> warning nhưng không crash
Metadata invalid -> load artifact error rõ ràng
Unsupported arg type -> advanced JSON fallback
Save workflow -> reload đúng nodes/edges/config
Export commands -> command chạy được ngoài UI
```

---

**Định Hướng Demo Hackathon**

Demo tốt nhất nên đi theo câu chuyện:

```txt
A new Portaldot dev opens the board.
The board checks local chain and account.
The dev builds or loads a contract artifact.
The board reads metadata and shows contract messages.
The dev deploys contract with confirmation.
The dev calls a write message.
The board decodes event and shows state change.
If anything fails, the board explains why and how to fix it.
```

Đây là câu chuyện rất mạnh, vì nó không chỉ là “visual UI”, mà là **developer guidance system for smart contract workflows**.

**Kết Luận**

Các tính năng này hoàn toàn nên đưa vào visual board. Nhưng muốn thành công, phải ưu tiên **workflow correctness** hơn số lượng node. Mỗi node cần input/output rõ, validation chặt, trạng thái trung thực, và lỗi phải được dịch thành hướng dẫn có ích.

Lộ trình đúng là:

```txt
Build a reliable execution engine first.
Then make nodes generic via metadata.
Then add safety modals and debug guidance.
Then expand templates.
```

Làm theo hướng này thì dự án không chỉ đẹp để demo, mà còn thật sự có ích cho dev blockchain dùng Portaldot.