/**
 * ShadowAccountAnonymizer Contract ABI
 *
 * This file is auto-generated from Cairo build artifacts.
 * Do not edit manually - run 'npm run generate:anonymizer-abi' to regenerate.
 */
export declare const ShadowAccountAnonymizerABI: readonly [{
    readonly type: "impl";
    readonly name: "ShadowAccountAnonymizerImpl";
    readonly interface_name: "shadow_account_anonymizer::shadow_account_anonymizer::IShadowAccountAnonymizer";
}, {
    readonly type: "struct";
    readonly name: "core::array::Span::<core::felt252>";
    readonly members: readonly [{
        readonly name: "snapshot";
        readonly type: "@core::array::Array::<core::felt252>";
    }];
}, {
    readonly type: "struct";
    readonly name: "core::starknet::account::Call";
    readonly members: readonly [{
        readonly name: "to";
        readonly type: "core::starknet::contract_address::ContractAddress";
    }, {
        readonly name: "selector";
        readonly type: "core::felt252";
    }, {
        readonly name: "calldata";
        readonly type: "core::array::Span::<core::felt252>";
    }];
}, {
    readonly type: "enum";
    readonly name: "shadow_account_anonymizer::shadow_account_anonymizer::CollectPolicy";
    readonly variants: readonly [{
        readonly name: "All";
        readonly type: "()";
    }, {
        readonly name: "Diff";
        readonly type: "()";
    }, {
        readonly name: "Exact";
        readonly type: "core::integer::u128";
    }];
}, {
    readonly type: "struct";
    readonly name: "shadow_account_anonymizer::shadow_account_anonymizer::OpenNote";
    readonly members: readonly [{
        readonly name: "note_id";
        readonly type: "core::felt252";
    }, {
        readonly name: "token";
        readonly type: "core::starknet::contract_address::ContractAddress";
    }, {
        readonly name: "collect_policy";
        readonly type: "shadow_account_anonymizer::shadow_account_anonymizer::CollectPolicy";
    }];
}, {
    readonly type: "struct";
    readonly name: "core::array::Span::<shadow_account_anonymizer::shadow_account_anonymizer::OpenNote>";
    readonly members: readonly [{
        readonly name: "snapshot";
        readonly type: "@core::array::Array::<shadow_account_anonymizer::shadow_account_anonymizer::OpenNote>";
    }];
}, {
    readonly type: "struct";
    readonly name: "privacy::objects::OpenNoteDeposit";
    readonly members: readonly [{
        readonly name: "note_id";
        readonly type: "core::felt252";
    }, {
        readonly name: "token";
        readonly type: "core::starknet::contract_address::ContractAddress";
    }, {
        readonly name: "amount";
        readonly type: "core::integer::u128";
    }];
}, {
    readonly type: "struct";
    readonly name: "core::array::Span::<privacy::objects::OpenNoteDeposit>";
    readonly members: readonly [{
        readonly name: "snapshot";
        readonly type: "@core::array::Array::<privacy::objects::OpenNoteDeposit>";
    }];
}, {
    readonly type: "enum";
    readonly name: "core::bool";
    readonly variants: readonly [{
        readonly name: "False";
        readonly type: "()";
    }, {
        readonly name: "True";
        readonly type: "()";
    }];
}, {
    readonly type: "struct";
    readonly name: "shadow_account_anonymizer::shadow_account_anonymizer::ShadowAccountInfo";
    readonly members: readonly [{
        readonly name: "nonce";
        readonly type: "core::integer::u64";
    }, {
        readonly name: "address";
        readonly type: "core::starknet::contract_address::ContractAddress";
    }, {
        readonly name: "is_deployed";
        readonly type: "core::bool";
    }];
}, {
    readonly type: "struct";
    readonly name: "core::array::Span::<shadow_account_anonymizer::shadow_account_anonymizer::ShadowAccountInfo>";
    readonly members: readonly [{
        readonly name: "snapshot";
        readonly type: "@core::array::Array::<shadow_account_anonymizer::shadow_account_anonymizer::ShadowAccountInfo>";
    }];
}, {
    readonly type: "interface";
    readonly name: "shadow_account_anonymizer::shadow_account_anonymizer::IShadowAccountAnonymizer";
    readonly items: readonly [{
        readonly type: "function";
        readonly name: "privacy_compute";
        readonly inputs: readonly [{
            readonly name: "identity_key";
            readonly type: "core::felt252";
        }, {
            readonly name: "dapp_name";
            readonly type: "core::felt252";
        }, {
            readonly name: "nonce";
            readonly type: "core::felt252";
        }];
        readonly outputs: readonly [{
            readonly type: "core::felt252";
        }];
        readonly state_mutability: "view";
    }, {
        readonly type: "function";
        readonly name: "privacy_invoke_with_computation";
        readonly inputs: readonly [{
            readonly name: "identity_commitment";
            readonly type: "core::felt252";
        }, {
            readonly name: "calls";
            readonly type: "core::array::Array::<core::starknet::account::Call>";
        }, {
            readonly name: "open_notes";
            readonly type: "core::array::Span::<shadow_account_anonymizer::shadow_account_anonymizer::OpenNote>";
        }];
        readonly outputs: readonly [{
            readonly type: "core::array::Span::<privacy::objects::OpenNoteDeposit>";
        }];
        readonly state_mutability: "external";
    }, {
        readonly type: "function";
        readonly name: "get_shadow_accounts";
        readonly inputs: readonly [{
            readonly name: "partial_commitment";
            readonly type: "core::felt252";
        }, {
            readonly name: "start_nonce";
            readonly type: "core::integer::u64";
        }, {
            readonly name: "end_nonce";
            readonly type: "core::integer::u64";
        }, {
            readonly name: "until_undeployed";
            readonly type: "core::bool";
        }];
        readonly outputs: readonly [{
            readonly type: "core::array::Span::<shadow_account_anonymizer::shadow_account_anonymizer::ShadowAccountInfo>";
        }];
        readonly state_mutability: "view";
    }, {
        readonly type: "function";
        readonly name: "get_shadow_account";
        readonly inputs: readonly [{
            readonly name: "identity_commitment";
            readonly type: "core::felt252";
        }];
        readonly outputs: readonly [{
            readonly type: "core::starknet::contract_address::ContractAddress";
        }];
        readonly state_mutability: "view";
    }, {
        readonly type: "function";
        readonly name: "get_privacy_contract";
        readonly inputs: readonly [];
        readonly outputs: readonly [{
            readonly type: "core::starknet::contract_address::ContractAddress";
        }];
        readonly state_mutability: "view";
    }, {
        readonly type: "function";
        readonly name: "get_shadow_account_class_hash";
        readonly inputs: readonly [];
        readonly outputs: readonly [{
            readonly type: "core::starknet::class_hash::ClassHash";
        }];
        readonly state_mutability: "view";
    }];
}, {
    readonly type: "impl";
    readonly name: "ReplaceabilityImpl";
    readonly interface_name: "starkware_utils::components::replaceability::interface::IReplaceable";
}, {
    readonly type: "struct";
    readonly name: "starkware_utils::components::replaceability::interface::EICData";
    readonly members: readonly [{
        readonly name: "eic_hash";
        readonly type: "core::starknet::class_hash::ClassHash";
    }, {
        readonly name: "eic_init_data";
        readonly type: "core::array::Span::<core::felt252>";
    }];
}, {
    readonly type: "enum";
    readonly name: "core::option::Option::<starkware_utils::components::replaceability::interface::EICData>";
    readonly variants: readonly [{
        readonly name: "Some";
        readonly type: "starkware_utils::components::replaceability::interface::EICData";
    }, {
        readonly name: "None";
        readonly type: "()";
    }];
}, {
    readonly type: "struct";
    readonly name: "starkware_utils::components::replaceability::interface::ImplementationData";
    readonly members: readonly [{
        readonly name: "impl_hash";
        readonly type: "core::starknet::class_hash::ClassHash";
    }, {
        readonly name: "eic_data";
        readonly type: "core::option::Option::<starkware_utils::components::replaceability::interface::EICData>";
    }, {
        readonly name: "final";
        readonly type: "core::bool";
    }];
}, {
    readonly type: "interface";
    readonly name: "starkware_utils::components::replaceability::interface::IReplaceable";
    readonly items: readonly [{
        readonly type: "function";
        readonly name: "get_upgrade_delay";
        readonly inputs: readonly [];
        readonly outputs: readonly [{
            readonly type: "core::integer::u64";
        }];
        readonly state_mutability: "view";
    }, {
        readonly type: "function";
        readonly name: "get_impl_activation_time";
        readonly inputs: readonly [{
            readonly name: "implementation_data";
            readonly type: "starkware_utils::components::replaceability::interface::ImplementationData";
        }];
        readonly outputs: readonly [{
            readonly type: "core::integer::u64";
        }];
        readonly state_mutability: "view";
    }, {
        readonly type: "function";
        readonly name: "add_new_implementation";
        readonly inputs: readonly [{
            readonly name: "implementation_data";
            readonly type: "starkware_utils::components::replaceability::interface::ImplementationData";
        }];
        readonly outputs: readonly [];
        readonly state_mutability: "external";
    }, {
        readonly type: "function";
        readonly name: "add_new_implementation_unsafe";
        readonly inputs: readonly [{
            readonly name: "implementation_data";
            readonly type: "starkware_utils::components::replaceability::interface::ImplementationData";
        }];
        readonly outputs: readonly [];
        readonly state_mutability: "external";
    }, {
        readonly type: "function";
        readonly name: "remove_implementation";
        readonly inputs: readonly [{
            readonly name: "implementation_data";
            readonly type: "starkware_utils::components::replaceability::interface::ImplementationData";
        }];
        readonly outputs: readonly [];
        readonly state_mutability: "external";
    }, {
        readonly type: "function";
        readonly name: "replace_to";
        readonly inputs: readonly [{
            readonly name: "implementation_data";
            readonly type: "starkware_utils::components::replaceability::interface::ImplementationData";
        }];
        readonly outputs: readonly [];
        readonly state_mutability: "external";
    }, {
        readonly type: "function";
        readonly name: "validate_upgradeability";
        readonly inputs: readonly [{
            readonly name: "implementation_data";
            readonly type: "starkware_utils::components::replaceability::interface::ImplementationData";
        }];
        readonly outputs: readonly [];
        readonly state_mutability: "external";
    }];
}, {
    readonly type: "impl";
    readonly name: "CommonRolesImpl";
    readonly interface_name: "starkware_utils::components::roles::interface::ICommonRoles";
}, {
    readonly type: "enum";
    readonly name: "starkware_utils::components::roles::interface::Role";
    readonly variants: readonly [{
        readonly name: "AppGovernor";
        readonly type: "()";
    }, {
        readonly name: "AppRoleAdmin";
        readonly type: "()";
    }, {
        readonly name: "GovernanceAdmin";
        readonly type: "()";
    }, {
        readonly name: "Operator";
        readonly type: "()";
    }, {
        readonly name: "TokenAdmin";
        readonly type: "()";
    }, {
        readonly name: "UpgradeAgent";
        readonly type: "()";
    }, {
        readonly name: "UpgradeGovernor";
        readonly type: "()";
    }, {
        readonly name: "SecurityAdmin";
        readonly type: "()";
    }, {
        readonly name: "SecurityAgent";
        readonly type: "()";
    }, {
        readonly name: "SecurityGovernor";
        readonly type: "()";
    }];
}, {
    readonly type: "struct";
    readonly name: "core::array::Span::<core::starknet::contract_address::ContractAddress>";
    readonly members: readonly [{
        readonly name: "snapshot";
        readonly type: "@core::array::Array::<core::starknet::contract_address::ContractAddress>";
    }];
}, {
    readonly type: "interface";
    readonly name: "starkware_utils::components::roles::interface::ICommonRoles";
    readonly items: readonly [{
        readonly type: "function";
        readonly name: "grant_role";
        readonly inputs: readonly [{
            readonly name: "role";
            readonly type: "starkware_utils::components::roles::interface::Role";
        }, {
            readonly name: "account";
            readonly type: "core::starknet::contract_address::ContractAddress";
        }];
        readonly outputs: readonly [];
        readonly state_mutability: "external";
    }, {
        readonly type: "function";
        readonly name: "revoke_role";
        readonly inputs: readonly [{
            readonly name: "role";
            readonly type: "starkware_utils::components::roles::interface::Role";
        }, {
            readonly name: "account";
            readonly type: "core::starknet::contract_address::ContractAddress";
        }];
        readonly outputs: readonly [];
        readonly state_mutability: "external";
    }, {
        readonly type: "function";
        readonly name: "has_role";
        readonly inputs: readonly [{
            readonly name: "role";
            readonly type: "starkware_utils::components::roles::interface::Role";
        }, {
            readonly name: "account";
            readonly type: "core::starknet::contract_address::ContractAddress";
        }];
        readonly outputs: readonly [{
            readonly type: "core::bool";
        }];
        readonly state_mutability: "view";
    }, {
        readonly type: "function";
        readonly name: "renounce";
        readonly inputs: readonly [{
            readonly name: "role";
            readonly type: "starkware_utils::components::roles::interface::Role";
        }];
        readonly outputs: readonly [];
        readonly state_mutability: "external";
    }, {
        readonly type: "function";
        readonly name: "reclaim_legacy_roles";
        readonly inputs: readonly [];
        readonly outputs: readonly [];
        readonly state_mutability: "external";
    }, {
        readonly type: "function";
        readonly name: "reclaim_legacy_roles_for_accounts";
        readonly inputs: readonly [{
            readonly name: "accounts";
            readonly type: "core::array::Span::<core::starknet::contract_address::ContractAddress>";
        }];
        readonly outputs: readonly [];
        readonly state_mutability: "external";
    }, {
        readonly type: "function";
        readonly name: "disable_legacy_role_reclaim";
        readonly inputs: readonly [];
        readonly outputs: readonly [];
        readonly state_mutability: "external";
    }];
}, {
    readonly type: "constructor";
    readonly name: "constructor";
    readonly inputs: readonly [{
        readonly name: "privacy_contract";
        readonly type: "core::starknet::contract_address::ContractAddress";
    }, {
        readonly name: "shadow_account_class_hash";
        readonly type: "core::starknet::class_hash::ClassHash";
    }, {
        readonly name: "governance_admin";
        readonly type: "core::starknet::contract_address::ContractAddress";
    }];
}, {
    readonly type: "event";
    readonly name: "starkware_utils::components::replaceability::interface::ImplementationAdded";
    readonly kind: "struct";
    readonly members: readonly [{
        readonly name: "implementation_data";
        readonly type: "starkware_utils::components::replaceability::interface::ImplementationData";
        readonly kind: "data";
    }];
}, {
    readonly type: "event";
    readonly name: "starkware_utils::components::replaceability::interface::ImplementationRemoved";
    readonly kind: "struct";
    readonly members: readonly [{
        readonly name: "implementation_data";
        readonly type: "starkware_utils::components::replaceability::interface::ImplementationData";
        readonly kind: "data";
    }];
}, {
    readonly type: "event";
    readonly name: "starkware_utils::components::replaceability::interface::ImplementationReplaced";
    readonly kind: "struct";
    readonly members: readonly [{
        readonly name: "implementation_data";
        readonly type: "starkware_utils::components::replaceability::interface::ImplementationData";
        readonly kind: "data";
    }];
}, {
    readonly type: "event";
    readonly name: "starkware_utils::components::replaceability::interface::ImplementationFinalized";
    readonly kind: "struct";
    readonly members: readonly [{
        readonly name: "impl_hash";
        readonly type: "core::starknet::class_hash::ClassHash";
        readonly kind: "data";
    }];
}, {
    readonly type: "event";
    readonly name: "starkware_utils::components::replaceability::replaceability::ReplaceabilityComponent::Event";
    readonly kind: "enum";
    readonly variants: readonly [{
        readonly name: "ImplementationAdded";
        readonly type: "starkware_utils::components::replaceability::interface::ImplementationAdded";
        readonly kind: "nested";
    }, {
        readonly name: "ImplementationRemoved";
        readonly type: "starkware_utils::components::replaceability::interface::ImplementationRemoved";
        readonly kind: "nested";
    }, {
        readonly name: "ImplementationReplaced";
        readonly type: "starkware_utils::components::replaceability::interface::ImplementationReplaced";
        readonly kind: "nested";
    }, {
        readonly name: "ImplementationFinalized";
        readonly type: "starkware_utils::components::replaceability::interface::ImplementationFinalized";
        readonly kind: "nested";
    }];
}, {
    readonly type: "event";
    readonly name: "starkware_utils::components::common_roles::common_roles::CommonRolesComponent::Event";
    readonly kind: "enum";
    readonly variants: readonly [];
}, {
    readonly type: "event";
    readonly name: "openzeppelin_access::accesscontrol::accesscontrol::AccessControlComponent::RoleGranted";
    readonly kind: "struct";
    readonly members: readonly [{
        readonly name: "role";
        readonly type: "core::felt252";
        readonly kind: "data";
    }, {
        readonly name: "account";
        readonly type: "core::starknet::contract_address::ContractAddress";
        readonly kind: "data";
    }, {
        readonly name: "sender";
        readonly type: "core::starknet::contract_address::ContractAddress";
        readonly kind: "data";
    }];
}, {
    readonly type: "event";
    readonly name: "openzeppelin_access::accesscontrol::accesscontrol::AccessControlComponent::RoleGrantedWithDelay";
    readonly kind: "struct";
    readonly members: readonly [{
        readonly name: "role";
        readonly type: "core::felt252";
        readonly kind: "data";
    }, {
        readonly name: "account";
        readonly type: "core::starknet::contract_address::ContractAddress";
        readonly kind: "data";
    }, {
        readonly name: "sender";
        readonly type: "core::starknet::contract_address::ContractAddress";
        readonly kind: "data";
    }, {
        readonly name: "delay";
        readonly type: "core::integer::u64";
        readonly kind: "data";
    }];
}, {
    readonly type: "event";
    readonly name: "openzeppelin_access::accesscontrol::accesscontrol::AccessControlComponent::RoleRevoked";
    readonly kind: "struct";
    readonly members: readonly [{
        readonly name: "role";
        readonly type: "core::felt252";
        readonly kind: "data";
    }, {
        readonly name: "account";
        readonly type: "core::starknet::contract_address::ContractAddress";
        readonly kind: "data";
    }, {
        readonly name: "sender";
        readonly type: "core::starknet::contract_address::ContractAddress";
        readonly kind: "data";
    }];
}, {
    readonly type: "event";
    readonly name: "openzeppelin_access::accesscontrol::accesscontrol::AccessControlComponent::RoleAdminChanged";
    readonly kind: "struct";
    readonly members: readonly [{
        readonly name: "role";
        readonly type: "core::felt252";
        readonly kind: "data";
    }, {
        readonly name: "previous_admin_role";
        readonly type: "core::felt252";
        readonly kind: "data";
    }, {
        readonly name: "new_admin_role";
        readonly type: "core::felt252";
        readonly kind: "data";
    }];
}, {
    readonly type: "event";
    readonly name: "openzeppelin_access::accesscontrol::accesscontrol::AccessControlComponent::Event";
    readonly kind: "enum";
    readonly variants: readonly [{
        readonly name: "RoleGranted";
        readonly type: "openzeppelin_access::accesscontrol::accesscontrol::AccessControlComponent::RoleGranted";
        readonly kind: "nested";
    }, {
        readonly name: "RoleGrantedWithDelay";
        readonly type: "openzeppelin_access::accesscontrol::accesscontrol::AccessControlComponent::RoleGrantedWithDelay";
        readonly kind: "nested";
    }, {
        readonly name: "RoleRevoked";
        readonly type: "openzeppelin_access::accesscontrol::accesscontrol::AccessControlComponent::RoleRevoked";
        readonly kind: "nested";
    }, {
        readonly name: "RoleAdminChanged";
        readonly type: "openzeppelin_access::accesscontrol::accesscontrol::AccessControlComponent::RoleAdminChanged";
        readonly kind: "nested";
    }];
}, {
    readonly type: "event";
    readonly name: "openzeppelin_introspection::src5::SRC5Component::Event";
    readonly kind: "enum";
    readonly variants: readonly [];
}, {
    readonly type: "event";
    readonly name: "shadow_account_anonymizer::shadow_account_anonymizer::ShadowAccountAnonymizer::ShadowAccountDeployed";
    readonly kind: "struct";
    readonly members: readonly [{
        readonly name: "identity_commitment";
        readonly type: "core::felt252";
        readonly kind: "key";
    }, {
        readonly name: "shadow_account";
        readonly type: "core::starknet::contract_address::ContractAddress";
        readonly kind: "key";
    }];
}, {
    readonly type: "event";
    readonly name: "shadow_account_anonymizer::shadow_account_anonymizer::ShadowAccountAnonymizer::Event";
    readonly kind: "enum";
    readonly variants: readonly [{
        readonly name: "ReplaceabilityEvent";
        readonly type: "starkware_utils::components::replaceability::replaceability::ReplaceabilityComponent::Event";
        readonly kind: "flat";
    }, {
        readonly name: "CommonRolesEvent";
        readonly type: "starkware_utils::components::common_roles::common_roles::CommonRolesComponent::Event";
        readonly kind: "flat";
    }, {
        readonly name: "AccessControlEvent";
        readonly type: "openzeppelin_access::accesscontrol::accesscontrol::AccessControlComponent::Event";
        readonly kind: "flat";
    }, {
        readonly name: "SRC5Event";
        readonly type: "openzeppelin_introspection::src5::SRC5Component::Event";
        readonly kind: "flat";
    }, {
        readonly name: "ShadowAccountDeployed";
        readonly type: "shadow_account_anonymizer::shadow_account_anonymizer::ShadowAccountAnonymizer::ShadowAccountDeployed";
        readonly kind: "nested";
    }];
}];
//# sourceMappingURL=anonymizer-abi.d.ts.map