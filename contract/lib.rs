#[ink::contract]
mod membership {
    use ink::storage::Mapping;

    #[ink(storage)]
    pub struct Membership {
        join_fee: Balance,
        members: Mapping<AccountId, Timestamp>,
    }

    #[ink(event)]
    pub struct MemberJoined {
        #[ink(topic)]
        account: AccountId,
        joined_at: Timestamp,
        paid: Balance,
    }

    impl Membership {
        #[ink(constructor)]
        pub fn new(join_fee: Balance) -> Self {
            Self {
                join_fee,
                members: Mapping::default(),
            }
        }

        #[ink(message, payable)]
        pub fn join(&mut self) {
            let caller = self.env().caller();
            assert!(!self.is_member(caller), "already a member");

            let paid = self.env().transferred_value();
            assert!(paid >= self.join_fee, "insufficient join fee");

            let joined_at = self.env().block_timestamp();
            self.members.insert(caller, &joined_at);

            self.env().emit_event(MemberJoined {
                account: caller,
                joined_at,
                paid,
            });
        }

        #[ink(message)]
        pub fn is_member(&self, account: AccountId) -> bool {
            self.members.contains(account)
        }

        #[ink(message)]
        pub fn joined_at(&self, account: AccountId) -> Option<Timestamp> {
            self.members.get(account)
        }

        #[ink(message)]
        pub fn join_fee(&self) -> Balance {
            self.join_fee
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use ink::env::test;

        #[ink::test]
        fn join_records_membership() {
            let accounts = test::default_accounts::<ink::env::DefaultEnvironment>();
            let mut contract = Membership::new(10);

            test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
            test::set_value_transferred::<ink::env::DefaultEnvironment>(10);
            contract.join();

            assert!(contract.is_member(accounts.alice));
            assert!(contract.joined_at(accounts.alice).is_some());
        }

        #[ink::test]
        #[should_panic(expected = "insufficient join fee")]
        fn join_rejects_underpayment() {
            let accounts = test::default_accounts::<ink::env::DefaultEnvironment>();
            let mut contract = Membership::new(10);

            test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
            test::set_value_transferred::<ink::env::DefaultEnvironment>(9);
            contract.join();
        }
    }
}
