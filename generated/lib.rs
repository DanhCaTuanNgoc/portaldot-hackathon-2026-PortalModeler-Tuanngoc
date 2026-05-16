#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod membership {
    #[ink(storage)]
    pub struct Membership {
        // TODO: replace with generated state mappings.
    }

    impl Membership {
        #[ink(constructor)]
        pub fn new() -> Self {
            Self {}
        }

        #[ink(message)]
        pub fn join(&mut self) {
            // actor: User
            // requires: pay POT
            // emits: MemberJoined
            todo!("implement join");
        }
    }
}
