# PortalModeler Ideas

## Mục tiêu sản phẩm

PortalModeler là lớp mô hình hoá và trực quan hoá cho Portaldot, giúp dev đi từ ý tưởng tới tương tác với local chain mà không cần viết nhiều code phức tạp.

Thay vì bắt đầu bằng Rust, ink!, CLI và dry-run gas ngay từ đầu, người dùng sẽ:

- Kéo thả action node để mô hình hoá luồng nghiệp vụ.
- Xem dữ liệu chain, state, event và balance theo dạng trực quan.
- Sinh ra command, checklist, contract skeleton và flow tương tác từ mô hình.

## Pain points cần giải quyết

- Dev mới vào hệ Portaldot bị ngợp vì phải hiểu chain, account, SS58, gas, contract metadata, wasm, event và runtime API cùng lúc.
- Luồng query/deploy/call bị chia rời giữa nhiều script và tài liệu.
- Người mới không biết nên bắt đầu từ state nào, action nào, hay dữ liệu nào là đầu vào/đầu ra.
- Việc đọc dữ liệu chain hiện tại còn thiên về terminal output, thiếu lớp trực quan hoá.
- Các tham số như `--value`, gas fallback, address, metadata, wasm dễ gây lỗi khi nhập tay.
- Local node setup có nhiều bước, trong khi dev chỉ muốn test nhanh một flow nhỏ.

## Ý tưởng lõi

### 1. Action Graph Builder

Một canvas kiểu kéo-thả để xây dựng flow portaldot.

Mỗi node đại diện cho một khối logic:

- `Query Node`: đọc chain, account, state, balance.
- `Deploy Node`: deploy contract, chọn metadata/wasm, cấu hình fee và gas.
- `Call Node`: gọi action như `join`, `is_member`, `joined_at`.
- `Input Node`: nhập address, amount, seed, file artifact.
- `Event Node`: nhận và hiển thị event như `MemberJoined`.
- `Condition Node`: kiểm tra balance đủ, contract tồn tại, state hợp lệ.
- `Transform Node`: map dữ liệu từ chain thành payload cho node tiếp theo.

Người dùng nối node với nhau để mô tả quy trình thay vì viết script thủ công.

### 2. Data Visualizer

Một lớp hiển thị dữ liệu chain theo dạng dễ hiểu.

Nên có các view:

- Account view: address, balance, nonce, token symbol, decimals.
- Contract view: address, metadata, wasm hash, constructor, messages.
- State view: `is_member`, `joined_at`, mapping account -> value.
- Event timeline: sequence of events theo thời gian hoặc theo extrinsic.
- Gas view: dry-run estimate, fallback gas, actual gas used.

Mục tiêu là dev nhìn vào là hiểu ngay “đang có gì trên chain”, thay vì đọc JSON raw.

### 3. Guided Beginner Mode

Chế độ dành cho người mới bắt đầu.

Tính năng:

- Chỉ hiện các node cơ bản trước, ẩn bớt advanced setting.
- Có wizard từng bước: chọn node -> chọn nguồn data -> test -> generate.
- Tự gợi ý values mặc định cho local dev như `//Alice`, `ws://127.0.0.1:9944`, `SS58 42`.
- Cảnh báo rõ khi người dùng đang ở local dev mode và không phải mainnet.
- Tự sinh checklist “bước tiếp theo nên làm gì”.

### 4. Auto Command Generator

Từ canvas, sinh ra:

- Python command để query/deploy/call.
- Terminal log preview.
- Checklist chạy local node.
- Contract/action skeleton.
- Mapping giữa node flow và action model JSON.

Ví dụ:

- `Query Node` + `Account Input` -> `python scripts/query.py --account ...`
- `Deploy Node` + `Value Input` -> `python scripts/deploy.py --fee ...`
- `Call Node` + `Join Action` -> `python scripts/call.py --action join --value ...`

### 5. Live Local Node Feedback

Kết nối trực tiếp với local node để xem log và trạng thái thật.

Hiển thị:

- Node status: starting, syncing, listening, failed.
- RPC endpoint status.
- Latest block / highest known block.
- Balance refresh sau khi top up từ ALICE.
- Deploy success / failure và reason.

## Fitur đề xuất theo user journey

### A. Start Here

Màn hình đầu tiên nên hỏi:

- Bạn muốn làm gì?
- Query chain
- Deploy contract
- Call action
- Xem state / event
- Học flow Portaldot bằng kéo thả

### B. Build Flow

Canvas trung tâm với palette node bên trái.

Người dùng có thể:

- Kéo node từ palette ra canvas.
- Nối output của node này vào input của node khác.
- Click node để chỉnh tham số.
- Xem preview command ngay dưới node.
- Run flow từng bước hoặc chạy toàn bộ.

### C. Inspect Result

Sau khi chạy flow, panel kết quả hiển thị:

- Raw output từ script.
- Dữ liệu được decode.
- Event timeline.
- Diff trước/sau khi tương tác.
- Error hint nếu thiếu artifact, thiếu balance, sai address, hoặc node chưa chạy.

### D. Export / Share

Dev có thể export flow thành:

- JSON model.
- Markdown checklist.
- Python command sheet.
- Screenshot diagram cho docs hoặc PR.

## Các node nên có trước tiên

### Node cơ bản

- Chain Connect
- Account Select
- Balance Query
- Artifact Select
- Deploy Contract
- Read Contract
- Call Contract
- Event Viewer
- State Viewer

### Node hỗ trợ người mới

- Local Faucet Hint
- Alice Top-up Helper
- Gas Estimator
- Error Explainer
- Setup Checklist

### Node nâng cao sau này

- Branch / condition
- Loop over accounts
- Batch call
- Compare state snapshots
- Export to generated docs

## UI/UX principles

- Mỗi node phải trả lời được 3 câu: input gì, output gì, lỗi thường gặp gì.
- Mọi thao tác quan trọng phải có preview trước khi chạy.
- Không bắt người mới nhập code khi chưa cần thiết.
- Ưu tiên kéo thả, select box, auto-fill, và command preview.
- Các state quan trọng phải được biểu diễn trực quan bằng timeline, badge, hoặc card.

## How this solves pain points

- Mô hình hoá: biến contract/action flow thành graph thay vì script rời rạc.
- Trực quan hoá dữ liệu: state, balance, event, gas được hiển thị bằng card và timeline.
- Thao tác đơn giản: người mới chỉ cần kéo node, chọn giá trị, bấm run.
- Giảm lỗi nhập tay: command, address, fee, gas được sinh tự động hoặc gợi ý.
- Học nhanh hơn: người mới thấy ngay mối quan hệ giữa chain, contract, account và event.

## MVP đề xuất

MVP nên có:

- Canvas kéo-thả 5 node: Query, Deploy, Call, State, Event.
- Panel xem log thật từ local node.
- Panel xem dữ liệu account và contract.
- Generator xuất ra checklist và command.
- Beginner mode với cấu hình local mặc định.

## Roadmap ngắn

### Phase 1

- Canvas cơ bản.
- Live logs.
- Query/deploy/call flow.
- Export markdown.

### Phase 2

- State visualizer.
- Event timeline.
- Gas estimator.
- Node templates cho local dev.

### Phase 3

- Multi-flow workspace.
- Shareable models.
- Auto-generated docs và onboarding.
- Advanced branching and batch actions.

## Kết luận

PortalModeler nên được định vị như một lớp mô hình hoá thao tác Portaldot dành cho dev mới và dev muốn prototype nhanh: ít code, nhiều trực quan, có thể kéo thả, và luôn nhìn thấy dữ liệu chain thật.
