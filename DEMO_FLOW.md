Mình đã rà lại dự án và chốt flow nên demo là:

**Flow được chọn: “POT Transfer Proof”**

Đừng demo Membership contract làm core flow lúc này. Nó ấn tượng về ý tưởng, nhưng hiện đang có rủi ro runtime/deploy. Flow mạnh nhất để đạt Green là flow nhỏ, thật, có log onchain rõ:

```txt
Open PortalModeler Workbench
-> connect local Portaldot node ws://127.0.0.1:9944
-> query Alice balance as POT
-> estimate fee bằng payment_queryInfo
-> submit real Balances.transfer_keep_alive
-> show POT amount + fee + extrinsic hash + block hash
-> show events: Balances.Transfer + System.ExtrinsicSuccess
```

Mình vừa verify lại trực tiếp:

```txt
Free balance: 11528.209802 POT
Amount: 0.010000 POT
Estimated fee: 270227051 base units (0.000003 POT)
Success: True
Extrinsic: 0x2fe080a4ad253208c0f209aa0f2e39c82cb60b8d5ebe2fbd02b40144c6aaea67
Block hash: 0x0b891330c9860b45a368b54bbf4cf3021066eb3e90bf527492b6e682742c1447
Events:
- Balances.Transfer
- TransactionPayment.TransactionFeePaid
- System.ExtrinsicSuccess
```

Code path có thể trích trong submission:

- Transfer thật + fee estimate: [scripts/transfer.py](D:/Coding/PortalPot-Hackathon/portaldot-proof/scripts/transfer.py:43)
- Balance query: [scripts/query.py](D:/Coding/PortalPot-Hackathon/portaldot-proof/scripts/query.py:20)
- Frontend safe runner mapping `transferPot`: [vite.config.ts](D:/Coding/PortalPot-Hackathon/portaldot-proof/front-end/vite.config.ts:137)
- UI node `Transfer POT`: [App.tsx](D:/Coding/PortalPot-Hackathon/portaldot-proof/front-end/src/App.tsx:301)

**Demo 60-90 giây nên quay như sau**

1. Start local node: `portaldot_dev --dev --tmp --alice`
2. Open Workbench.
3. Show endpoint `ws://127.0.0.1:9944`.
4. Run `Check Balance`.
5. Run `Transfer POT`.
6. Zoom vào Run Logs: amount, estimated fee, extrinsic hash, block hash, events.
7. Kết câu: “This is not a static screenshot. The workbench executed a real local Portaldot transaction through a whitelisted runner.”

**Mock phải label rõ**

Ghi thẳng trong demo/submission:

```txt
Mocked/local helper:
Export workflow, command sheet, generated report, event helper views are local UI helpers.

Real onchain core:
Balance query, payment_queryInfo fee estimate, Balances.transfer_keep_alive transaction, extrinsic/block hash, and success events.
```

**Một câu pitch nên dùng**

“PortalModeler turns a visual workflow node into a real Portaldot action: the user runs one Transfer POT node, the system estimates POT fee, submits the transaction locally, then returns the extrinsic hash, block hash, and chain events inside the workbench.”

Frontend build cũng pass: `npm run build` thành công. Flow này đủ Rule 1, đúng Rule 2, và tránh bị trừ Rule 3 vì core không dựa vào mock.