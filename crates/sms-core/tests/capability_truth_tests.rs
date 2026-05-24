use sms_core::models::{ProviderCapabilityMatrix, ReuseCapability};

#[test]
fn capability_truth_fivesim_capabilities() {
    let matrix = ProviderCapabilityMatrix::new();
    assert!(matrix.supports("fivesim", ReuseCapability::ExactNumberReuse));
    assert!(matrix.supports("fivesim", ReuseCapability::IntentReuse));
    assert!(!matrix.supports("fivesim", ReuseCapability::SameActivationRetry));
    assert!(!matrix.supports("fivesim", ReuseCapability::Unsupported));
}

#[test]
fn capability_truth_herosms_capabilities() {
    let matrix = ProviderCapabilityMatrix::new();
    assert!(matrix.supports("herosms", ReuseCapability::ExactNumberReuse));
    assert!(matrix.supports("herosms", ReuseCapability::SameActivationRetry));
    assert!(!matrix.supports("herosms", ReuseCapability::IntentReuse));
    assert!(!matrix.supports("herosms", ReuseCapability::Unsupported));
}

#[test]
fn capability_truth_smsbower_capabilities() {
    let matrix = ProviderCapabilityMatrix::new();
    assert!(matrix.supports("smsbower", ReuseCapability::SameActivationRetry));
    assert!(!matrix.supports("smsbower", ReuseCapability::ExactNumberReuse));
    assert!(!matrix.supports("smsbower", ReuseCapability::IntentReuse));
    assert!(!matrix.supports("smsbower", ReuseCapability::Unsupported));
}

#[test]
fn capability_truth_retry_is_not_reuse() {
    assert_ne!(
        ReuseCapability::SameActivationRetry,
        ReuseCapability::ExactNumberReuse
    );
    assert_ne!(
        ReuseCapability::SameActivationRetry,
        ReuseCapability::IntentReuse
    );
}

#[test]
fn capability_truth_fixture_parseable() {
    let fixtures = [
        include_str!("fixtures/5sim_reuse_exact.json"),
        include_str!("fixtures/5sim_reuse_intent.json"),
        include_str!("fixtures/herosms_reactivate.json"),
        include_str!("fixtures/herosms_retry.json"),
        include_str!("fixtures/smsbower_retry.json"),
    ];
    for (i, content) in fixtures.iter().enumerate() {
        serde_json::from_str::<serde_json::Value>(content)
            .unwrap_or_else(|e| panic!("fixture {} failed to parse: {}", i, e));
    }
}

#[test]
fn capability_truth_unknown_provider_returns_empty() {
    let matrix = ProviderCapabilityMatrix::new();
    assert!(matrix.capabilities_for("unknown_provider").is_empty());
    assert!(!matrix.supports("unknown_provider", ReuseCapability::ExactNumberReuse));
}
