# PortalModeler Demo Flow

Recommended demo: **POT Transfer Proof**

Do not use the Membership contract deploy as the core demo right now. The contract workflow is useful as an extended direction, but the current stable proof is smaller and stronger:

```txt
Open PortalModeler Workbench
-> connect to local Portaldot node at ws://127.0.0.1:9944
-> query Alice balance as POT
-> estimate fee with payment_queryInfo
-> submit a real Balances.transfer_keep_alive transaction
-> show POT amount, estimated fee, extrinsic hash, block hash
-> show Balances.Transfer and System.ExtrinsicSuccess events
```

## 60-90 Second Narrative

```txt
PortalModeler is a visual execution workbench for Portaldot builders.

For this demo I am using the smallest reliable onchain proof: a local POT transfer.

First, the workbench checks that the local Portaldot RPC is reachable at ws://127.0.0.1:9944. Then I run Check Balance, which reads Alice's account state from System.Account. Next I run Transfer POT. Before submitting anything, the script estimates the transaction fee through payment_queryInfo, so the builder can see the expected POT cost.

When I confirm the write action, the browser does not execute arbitrary shell commands. It sends an approved node kind to the local safe runner, and the runner maps that node to a whitelisted Python script.

The transaction is included on the local chain. The workbench brings back the important evidence: amount, estimated fee, extrinsic hash, block hash, and events such as Balances.Transfer and System.ExtrinsicSuccess.

The key point is that this is not a static mockup. One visual node triggers a real local Portaldot transaction and returns reproducible evidence for the builder.
```

## Operator Script

1. Start the local node:

```powershell
portaldot_dev --dev --tmp --alice
```

2. Start the workbench:

```powershell
cd front-end
npm run dev
```

3. Open the Vite URL, usually:

```txt
http://127.0.0.1:5173
```

4. Show the workbench status strip:

```txt
RPC endpoint: online
Endpoint: ws://127.0.0.1:9944
```

5. Run `Check Balance`.

6. Run `Transfer POT`.

7. Confirm the write-action modal.

8. Zoom into Run Logs and Proof Evidence:

```txt
Amount: 0.010000 POT
Estimated fee: <fee> POT
Success: True
Extrinsic: <extrinsic hash>
Block hash: <block hash>
Events:
- Balances.Transfer
- TransactionPayment.TransactionFeePaid
- System.ExtrinsicSuccess
```

## What Is Real

- Local Portaldot RPC connection.
- Account balance query through `System.Account`.
- Fee estimate through `payment_queryInfo`.
- Included `Balances.transfer_keep_alive` extrinsic.
- Extrinsic hash, block hash, and chain events returned from the local node.
- Browser-to-runner execution through an approved node whitelist.

## What Is Local Helper UI

- Visual canvas layout.
- Command sheet export.
- Markdown evidence report.
- Flow JSON and PortalModel JSON export.
- Generated ink! skeleton.
- Event helper views.

## One-Line Pitch

```txt
PortalModeler turns a visual workflow node into a real Portaldot action: the builder runs Transfer POT, the system estimates the fee, submits the transaction locally, then returns the extrinsic hash, block hash, and chain events inside the workbench.
```
