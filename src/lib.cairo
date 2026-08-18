// SPDX-License-Identifier: MIT

//! Airlock — denomination-bucketing anonymizer for the STRK20 privacy pool.
//!
//! StarkWare's own threat model logs amount correlation as an accepted P0 with
//! mitigation deferred, and names the fix: withdraw in fixed denominations so no
//! single leg carries a distinctive figure. Nothing implements it. This does.

pub mod bucketer;
pub mod ladder;

#[cfg(test)]
pub mod mocks;

#[cfg(test)]
mod tests;
