# Membership

Generated from `model/membership.json`.

## Actors

- User
- Admin

## States

- `is_member`: Mapping<AccountId,bool>
- `joined_at`: Mapping<AccountId,Timestamp>

## Actions

- `join` by User

## Events

- `MemberJoined`

## Deploy Checklist

- [ ] Run `cargo contract build --release`
- [ ] Run `python scripts/query.py` and confirm the signer has POT
- [ ] Run `python scripts/deploy.py --metadata <metadata.json> --wasm <contract.wasm>`
- [ ] Run `python scripts/call.py --action join --value <join_fee>`
- [ ] Run `python scripts/call.py --action is_member`
