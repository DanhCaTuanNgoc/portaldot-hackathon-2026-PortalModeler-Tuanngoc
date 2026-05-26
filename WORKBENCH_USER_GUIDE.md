# Huong dan PortalModeler Workbench cho nguoi moi

Tai lieu nay giai thich workbench hien tai bang ngon ngu don gian nhat. Ban khong can biet blockchain truoc. Hay hieu workbench nhu mot ban ve truc quan: moi o tren man hinh la mot buoc, bam chay tung buoc de ket noi blockchain local, deploy smart contract Membership, cho mot tai khoan tham gia membership, roi doc lai trang thai.

## 1. Workbench dang lam viec gi?

PortalModeler Workbench la man hinh ten **Membership Flow Board**. No dung de mo phong va chay mot luong smart contract tren Portaldot local.

Neu noi that de hieu:

- **Blockchain local** giong nhu mot mang blockchain chay tren may cua ban, dung de test an toan.
- **Smart contract** giong nhu mot chuong trinh nho duoc dua len blockchain.
- **Membership contract** la smart contract trong project nay. No co viec chinh la cho mot tai khoan goi `join()` de tro thanh member.
- **Node** la tung khoi tren bang. Moi node dai dien cho mot buoc, vi du: ket noi chain, chon tai khoan, deploy contract, join, doc trang thai.
- **Run** nghia la workbench goi script local trong thu muc `scripts/` de thuc hien buoc do.

Workbench khong tu do chay bat ky lenh nao. No chi cho phep chay cac node da duoc whitelist trong Vite middleware, giup demo an toan hon.

## 2. Cach mo Workbench

Tu trang home, bam **Open Workbench** hoac **Launch Workbench**.

Khi vao workbench, ban se thay:

- Thanh tren cung: ten workbench, nut Home, Beginner mode, trang thai RPC, nut Run.
- Dong trang thai nhanh: RPC endpoint, Artifacts, Contract, Membership.
- Cot trai: Palette, noi chua cac node co the them vao bang.
- Giua man hinh: Flow Canvas, noi sap xep va noi cac node.
- Cot phai: Inspector, noi xem va sua cau hinh cua node dang chon.
- Phan duoi: Account, Contract, State, Event Timeline, one-click artifact export, Command Sheet, Graph JSON, Markdown Export, Run Logs.

## 3. Giai thich thanh tren cung

### Home

Nut **Home** dua ban quay ve trang gioi thieu ban dau.

### Beginner mode

Nut **Beginner mode** bat/tat che do huong dan cho nguoi moi.

Khi bat, Inspector se hien:

- Goi y node nay co san sang chay khong.
- Can sua gi truoc khi chay.
- Checklist thiet lap co buoc nao da xong.

Khi tat, giao dien gon hon va bot phan giai thich.

### RPC online / RPC offline

Day la trang thai ket noi den blockchain local.

- **RPC online**: workbench ket noi duoc den node local, thuong la `ws://127.0.0.1:9944`.
- **RPC offline**: blockchain local chua chay, sai endpoint, hoac khong ket noi duoc.

Voi nguoi moi, hay hieu RPC nhu "cong giao tiep" de ung dung noi chuyen voi blockchain.

### Run node

Nut **Run node** chay node dang duoc chon.

Vi du ban chon node **Balance Query**, bam **Run node** thi workbench se goi lenh doc so du tai khoan.

### Run flow

Nut **Run flow** chay toan bo cac node tren board theo thu tu luong mac dinh:

1. Chain Connect
2. Account Select
3. Balance Query
4. Artifact Select
5. Deploy Membership
6. Join Membership
7. Check Is Member
8. Read Joined At
9. Event Viewer
10. Command Export

Neu mot node loi, flow se dung lai va ghi loi vao **Run Logs**.

### AI Flow Builder

Nut **AI** mo hop prompt de tao workflow tu ngon ngu tu nhien.

Neu may da cau hinh `GEMINI_API_KEY` voi `AI_PROVIDER=gemini`, workbench se goi `/api/ai-plan` o Vite middleware. API key nam server-side, khong nam trong browser.

AI chi duoc tra ve JSON workflow gom:

- `title`
- `summary`
- `steps`
- `edges`
- `autoRun`

Workbench se validate node kind theo whitelist truoc khi dua vao board. Neu provider AI khong san sang, workbench tu dong quay ve planner local cho Transfer POT.

AI khong duoc chay shell tuy y. Sau khi node duoc dua vao board, viec execute van di qua safe runner `/api/run-node`.

### Nut refresh local health

Nut icon dau tich tron dung de cap nhat lai trang thai local:

- RPC co online khong.
- Artifact contract co san sang khong.
- Contract da deploy co con ton tai tren chain hien tai khong.

Nen bam nut nay sau khi ban start local node, build contract, deploy contract, hoac doi endpoint.

### One-click artifact export

Thanh export nam ngay tren cac panel Command Sheet, Graph JSON va Markdown Export. Cac nut nay giup copy command sheet, tai Markdown, tai Flow JSON, tai PortalModel JSON, tai ink! skeleton, hoac import nguoc thanh visual board.

Nut **Replace import / Merge import** chon cach nap file:

- **Replace import**: thay board hien tai bang diagram import duoc.
- **Merge import**: giu board hien tai va them diagram import vao board.

Nut **Import file** hien co the doc:

- `portalmodeler-flow.json`
- `portalmodel.json`
- ink! metadata JSON
- file Rust ink! source `.rs`

Nut **Paste code** doc Rust ink! source tu clipboard va tao diagram prototype cho cac pattern pho bien nhu storage, message, event va payable.

## 4. Dong trang thai nhanh

Ngay duoi thanh topbar co 4 chip trang thai.

### RPC endpoint

Cho biet endpoint blockchain local co ket noi duoc khong.

- **online**: ket noi duoc.
- **offline**: chua ket noi duoc.

### Artifacts

Artifacts la file build cua smart contract, gom metadata JSON va WASM.

- **ready**: da co file contract can thiet.
- **missing**: chua build contract hoac file khong nam dung cho.

Voi nguoi moi, hay hieu artifact la "goi cai dat" cua smart contract truoc khi dua len blockchain.

### Contract

Cho biet contract Membership da deploy va con song tren chain hien tai khong.

- **pending**: chua co contract address.
- **live**: contract dang ton tai va goi duoc.
- **stale**: co file dia chi contract, nhung dia chi do khong ton tai tren chain hien tai. Viec nay hay xay ra khi ban restart local chain bang `--tmp`.

### Membership

Cho biet tai khoan hien tai da tham gia membership hay chua.

- **joined**: tai khoan da la member.
- **not joined**: tai khoan chua join.
- **unknown**: workbench chua doc duoc trang thai.

## 5. Palette: danh sach cac node co the them

Cot trai la **Palette**. Moi dong la mot node mau. Ban co the:

- Bam vao node de them vao canvas.
- Keo node tu Palette tha vao canvas.

Cac node hien tai:

### Local Node Manager

Dung de xem trang thai RPC va cac lenh local node can thiet:

- start node bang `python scripts/run_node.py`
- stop node bang `wsl pkill -f portaldot_dev`
- kiem tra RPC dang online hay offline

Node nay khong chay shell tuy y. No chi hien va log cac lenh da duoc du an chap nhan.

### Chain Connect

Dung de kiem tra ket noi den blockchain local.

Lenh tuong ung:

```txt
python scripts/doctor.py --url {endpoint}
```

Mac dinh endpoint la:

```txt
ws://127.0.0.1:9944
```

### Account Select

Dung de chon tai khoan ky giao dich. Mac dinh la tai khoan test `//Alice`.

Voi blockchain, moi hanh dong ghi du lieu can mot tai khoan ky. Giong nhu ban can dang nhap de thuc hien hanh dong.

### Balance Query

Dung de doc so du cua tai khoan dang chon.

No khong thay doi blockchain, chi doc thong tin.

### Transaction Preview

Dung de uoc tinh giao dich truoc khi submit.

Voi Transfer POT, node nay goi `scripts/transfer.py --dry-run-only` de lay fee tu `payment_queryInfo` ma khong gui extrinsic.

### Metadata Explorer

Dung de doc metadata ink! va liet ke:

- constructors
- messages
- events

Ket qua hien trong **Selected Outputs** va giup dev biet contract co the goi nhung message nao.

### Dry Run Call

Dung de dry-run contract call truoc khi submit. Hien tai node nay ho tro luong Membership `join` va in gas evidence neu runtime tra ve du lieu.

### State Diff

Dung de so sanh snapshot truoc va sau khi chay node:

- balance
- nonce
- contract reachable
- `is_member`
- `joined_at`

### Error Decoder

Dung de doc node moi nhat bi loi hoac bi chan, sau do hien goi y sua loi dua tren cac mau loi quen thuoc nhu RPC offline, stale contract, missing artifact, insufficient balance.

### Artifact Select

Dung de kiem tra file build cua contract:

- `contract/target/ink/membership.json`
- `contract/target/ink/membership.wasm`

Neu thieu, can build contract truoc.

### Deploy Membership

Dung de dua smart contract Membership len blockchain local.

Sau khi deploy thanh cong, dia chi contract se duoc luu vao:

```txt
contract-address.txt
```

Node nay co field `fee`, la muc phi join mac dinh cua membership contract.

### Join Membership

Dung de goi ham `join()` tren contract. Tai khoan se gui mot gia tri `value` de tham gia.

Neu tai khoan da la member, runner se bo qua `join()` de tranh loi contract da du kien truoc.

### Check Is Member

Dung de doc `is_member(account)`.

Ket qua cho biet tai khoan co phai member khong: `true` hoac `false`.

### Read Joined At

Dung de doc `joined_at(account)`.

Ket qua cho biet tai khoan da join vao thoi diem nao theo gia tri luu trong contract.

### Event Viewer

Dung de hien thi event lien quan den contract, dac biet la event **MemberJoined**.

Event co the hieu la "nhat ky su kien" do blockchain/contract phat ra sau mot hanh dong.

### Command Export

Dung de tao danh sach lenh va checklist dang markdown. Noi dung hien o phan **Markdown Export** ben duoi.

## 6. Flow Canvas: bang thao tac chinh

O giua man hinh la **Flow Canvas**. Day la noi ban nhin thay toan bo luong workflow.

Moi node tren canvas hien:

- Icon cua loai node.
- Trang thai node: `ready`, `running`, `success`, `warning`, hoac `error`.
- Ten node.
- Mo ta ngan.
- Lenh se chay.

Ban co the:

- Bam vao node de chon.
- Keo node de sap xep lai.
- Noi node voi node khac bang edge.
- Keo vung chon de chon nhieu node.
- Bam Delete hoac Backspace de xoa node dang chon.

Workbench se luon giu lai it nhat mot node tren board, vi Inspector va runner can co node lam moc.

## 7. Selection ops: cac nut thao tac voi node dang chon

O tren canvas co hop **Selection ops**.

### Run selection

Chay cac node dang chon theo thu tu flow hop ly, khong phu thuoc vao thu tu ban bam chon.

Neu node nao loi, viec chay selection se dung lai.

### Duplicate

Nhan ban node dang chon.

Node moi se:

- Co cau hinh giong node cu.
- Dat gan node cu.
- Co trang thai quay ve `ready`.
- Khong copy edge.

### Delete

Xoa cac node dang chon.

Neu ban dang chon tat ca node, workbench se chan xoa de board khong bi rong.

### Clear

Bo chon tat ca node hien tai. Node van con tren canvas, chi la khong con duoc selected.

## 8. Inspector: noi xem va sua node

Cot phai la **Inspector**. No luon hien thong tin cua node dang chon.

Inspector gom:

- Ten node.
- Mo ta node.
- Cac field cau hinh co the sua.
- Huong dan neu Beginner mode dang bat.
- Lenh command preview.
- Trang thai local health.
- Setup checklist.

### Cac field cau hinh thuong gap

- `endpoint`: dia chi blockchain local, thuong la `ws://127.0.0.1:9944`.
- `seed`: tai khoan test, mac dinh `//Alice`.
- `fee`: phi membership khi deploy.
- `value`: so tien/gui value khi goi `join()`.
- `action`: hanh dong contract can goi, vi du `join`, `is_member`, `joined_at`.

### Show advanced fields / Hide advanced fields

Mot so field duoc xem la nang cao:

- `account`
- `metadataPath`
- `wasmPath`
- `eventName`

Mac dinh Beginner mode se giau bot cac field nay de do roi. Bam **Show advanced fields** de hien, bam **Hide advanced fields** de an lai.

### Guidance card

Khi Beginner mode bat, workbench se noi node dang:

- **Ready to run**: co the chay.
- **Check before running**: nen xem lai truoc khi chay.
- **Action needed**: dang bi chan, can sua truoc.

Vi du:

- Neu RPC offline, cac node sau Chain Connect se bi canh bao.
- Neu chua co artifact, Deploy Membership se bi chan.
- Neu contract chua live, Join Membership va cac node doc state se bi chan.

### Command preview

Day la lenh that workbench se goi tu node. No giup ban hieu sau nut bam dang xay ra lenh gi.

### Local Health

Phan nay hien:

- RPC: online/offline.
- Artifacts: ready/missing.
- Contract: dia chi contract, stale, hoac not deployed.

### Setup Checklist

Checklist cho nguoi moi:

- Local RPC online.
- Contract artifacts ready.
- Live contract reachable.
- Membership state readable.

Khi muc nao xong, no se duoc danh dau.

## 9. Cac panel duoi man hinh

### Account

Hien thong tin tai khoan dang dung:

- Address: dia chi tai khoan.
- Balance: so du.
- Nonce: so thu tu giao dich cua tai khoan.

Nonce co the hieu don gian la bo dem so lan tai khoan da gui giao dich.

### Contract

Hien thong tin contract Membership:

- Address: dia chi contract tren chain.
- Metadata: duong dan file metadata.
- Messages: cac ham/message contract co the goi, vi du `join`, `is_member`, `joined_at`.

### State

Hien du lieu quan trong trong contract:

- `is_member`: tai khoan co phai member khong.
- `joined_at`: tai khoan da join luc nao.

### Event Timeline

Hien cac su kien lien quan:

- **Instantiated**: contract da duoc tao/deploy.
- **MemberJoined**: co tai khoan da join.
- Cac event khai bao trong metadata contract.

Trang thai event co the la:

- `waiting`: dang doi xay ra.
- `observed`: da thay tren trang thai hien tai.
- `decoded`: doc duoc tu metadata.
- `expected`: co trong metadata nhung chua co hanh dong thuc te.

### Command Sheet

Hien danh sach command theo flow. Day la cach de ban xem neu chay bang terminal thi can chay nhung lenh nao.

### Graph JSON

Hien cau truc graph hien tai gom:

- Nodes: id, loai node, vi tri, cau hinh.
- Edges: cac duong noi giua node.

Day la ban xuat may-doc-duoc cua flow.

### Selected Outputs

Hien output co cau truc cua node dang chon. Vi du:

- Metadata Explorer: constructors, messages, events.
- Transaction Preview: estimated fee.
- Dry Run Call: gas required.
- Transfer POT: extrinsic hash, block hash.
- State Diff: before/after changes.
- Error Decoder: explanation va suggested fixes.

### Markdown Export

Hien ban xuat de doc bang markdown. No liet ke tung buoc va command tuong ung.

### Run Logs

Hien log moi nhat khi ban chay node/flow.

Moi log co:

- Muc do: info, success, warning, error.
- Tieu de.
- Noi dung stdout/stderr/error.
- Goi y sua loi neu runner nhan ra van de quen thuoc.

Vi du goi y co the noi:

- Local RPC khong ket noi duoc.
- Contract address da cu.
- Thieu artifact.
- Tai khoan da la member.
- Khong du balance.

## 10. Luong demo khuyen nghi cho nguoi moi

Day la cach chay de de hieu nhat.

### Buoc 1: Dam bao blockchain local dang chay

Can co local node o endpoint:

```txt
ws://127.0.0.1:9944
```

Neu chip hien **RPC offline**, hay start local node truoc roi bam nut refresh local health.

### Buoc 2: Kiem tra Chain Connect

Chon node **Chain Connect**, bam **Run node**.

Muc tieu: xac nhan may cua ban noi chuyen duoc voi blockchain local.

### Buoc 3: Kiem tra tai khoan

Chon **Account Select**, bam **Run node**.

Sau do chon **Balance Query**, bam **Run node**.

Muc tieu: biet tai khoan test `//Alice` dang co balance de deploy va join.

### Buoc 4: Kiem tra artifact

Chon **Artifact Select**, bam **Run node**.

Neu missing, can build contract:

```powershell
cd contract
cargo contract build --release
cd ..
```

### Buoc 5: Deploy contract

Chon **Deploy Membership**, bam **Run node**.

Neu thanh cong, workbench se co contract address va Contract co the chuyen sang **live**.

### Buoc 6: Join membership

Chon **Join Membership**, bam **Run node**.

Day la buoc ghi du lieu len blockchain local. Tai khoan se goi ham `join()`.

### Buoc 7: Doc lai trang thai

Chay:

- **Check Is Member**
- **Read Joined At**
- **Event Viewer**

Muc tieu: thay `is_member = true`, co `joined_at`, va timeline co **MemberJoined**.

## 11. Run node, Run selection, Run flow khac nhau the nao?

- **Run node**: chi chay node dang chon.
- **Run selection**: chay nhom node dang chon theo thu tu dung.
- **Run flow**: chay tat ca node tren board theo thu tu flow mac dinh.

Neu ban moi hoc, hay chay tung node de hieu. Khi da quen, dung **Run flow** de demo nhanh.

## 12. Nhung loi thuong gap

### RPC offline

Nghia la workbench khong ket noi duoc blockchain local.

Cach xu ly:

- Start local node.
- Kiem tra endpoint co phai `ws://127.0.0.1:9944` khong.
- Bam refresh local health.

### Artifacts missing

Nghia la chua co file build cua contract.

Cach xu ly:

```powershell
cd contract
cargo contract build --release
cd ..
```

### Contract stale

Nghia la `contract-address.txt` co dia chi contract, nhung chain hien tai khong tim thay contract do.

Thuong xay ra khi local chain duoc restart bang che do tam thoi.

Cach xu ly:

- Deploy Membership lai.
- Neu runner dang reuse dia chi cu, xoa `contract-address.txt` roi deploy lai.

### Already a member

Nghia la tai khoan da join roi. Day khong nhat thiet la loi. Runner hien tai se skip `join()` de tranh contract bi assert.

### Insufficient balance

Nghia la tai khoan khong du tien local token de deploy/call.

Cach xu ly:

- Dung tai khoan local co san tien, vi du `//Alice`.
- Kiem tra lai Balance Query.

## 13. Tom tat nhanh

Neu chi can nho mot cau: workbench bien mot quy trinh blockchain kho hieu thanh mot bang truc quan, noi moi node la mot buoc co the bam chay, xem cau hinh, xem command, xem trang thai, va xem log.

Thu tu y nghia la:

```txt
Ket noi chain -> Chon tai khoan -> Kiem tra balance -> Kiem tra artifact -> Deploy contract -> Join membership -> Doc state -> Xem event -> Xuat command/graph
```

Voi nguoi moi, hay bat **Beginner mode**, chay tung node tu trai sang phai, doc **Guidance**, va nhin **Run Logs** khi co loi.
