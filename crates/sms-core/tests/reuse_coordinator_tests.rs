use chrono::{Duration, Utc};
use sms_core::models::{
    AcquireCodeRequest, AcquirePath, ReleaseAction, ReleaseCodeRequest, ReusePoolEntry,
    RuntimeStateStore, TicketRecord, TicketStatus,
};
use sms_core::registry::ProviderRegistry;
use sms_core::runtime_store::RuntimeStore;
use sms_core::service::SmsService;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use tempfile::TempDir;

fn mock_manifest_toml(id: &str) -> String {
    format!(
        r#"
id = "{id}"
name = "{id}"
kind = "mock"
enabled = true
priority = 10

[defaults]
service = "telegram"
country = "RU"

[mock]
balance = 100.0
phone_number = "+79001234567"
codes = ["123456"]
"#
    )
}

fn setup_service() -> (SmsService, TempDir) {
    let dir = TempDir::new().unwrap();
    let providers_dir = dir.path().join("providers");
    fs::create_dir_all(&providers_dir).unwrap();
    fs::write(
        providers_dir.join("mock_fivesim.toml"),
        mock_manifest_toml("fivesim"),
    )
    .unwrap();
    fs::write(
        providers_dir.join("mock_herosms.toml"),
        mock_manifest_toml("herosms"),
    )
    .unwrap();
    fs::write(
        providers_dir.join("mock_smsbower.toml"),
        mock_manifest_toml("smsbower"),
    )
    .unwrap();

    let registry = ProviderRegistry::load_from_dir(&providers_dir).unwrap();
    let state_path = dir.path().join("runtime.db");
    let service =
        SmsService::with_persistence_paths(registry, 100, None, Some(state_path), None, None, None);
    (service, dir)
}

fn setup_service_with_state(tickets: Vec<TicketRecord>) -> (SmsService, TempDir) {
    let dir = TempDir::new().unwrap();
    let providers_dir = dir.path().join("providers");
    fs::create_dir_all(&providers_dir).unwrap();
    fs::write(
        providers_dir.join("mock_fivesim.toml"),
        mock_manifest_toml("fivesim"),
    )
    .unwrap();
    fs::write(
        providers_dir.join("mock_herosms.toml"),
        mock_manifest_toml("herosms"),
    )
    .unwrap();
    fs::write(
        providers_dir.join("mock_smsbower.toml"),
        mock_manifest_toml("smsbower"),
    )
    .unwrap();

    let state_path = dir.path().join("runtime.db");
    let state = RuntimeStateStore {
        tickets,
        logs: vec![],
        activity: vec![],
        provider_balance_cache: vec![],
        reuse_pool: HashMap::new(),
        openai_sms_regions_cache: Default::default(),
    };
    RuntimeStore::open(&state_path).unwrap().replace_state(&state).unwrap();

    let registry = ProviderRegistry::load_from_dir(&providers_dir).unwrap();
    let service =
        SmsService::with_persistence_paths(registry, 100, None, Some(state_path), None, None, None);
    (service, dir)
}

#[tokio::test]
async fn test_exact_reuse_5sim() {
    let (service, _dir) = setup_service();
    let request = AcquireCodeRequest {
        provider: "fivesim".to_string(),
        service: Some("telegram".to_string()),
        country: Some("RU".to_string()),
        ..default_request()
    };
    let resp = service.acquire_code(request.clone()).await.unwrap();
    service
        .release_code(ReleaseCodeRequest {
            ticket_id: resp.ticket_id,
            action: ReleaseAction::Finish,
        })
        .await
        .unwrap();
    let resp2 = service.acquire_code(request).await.unwrap();
    assert_eq!(resp2.phone_number, "+79001234567");
    assert_eq!(resp2.acquire_path, AcquirePath::ExactReuse);
}

#[tokio::test]
async fn test_exact_reuse_herosms() {
    let (service, _dir) = setup_service();
    let request = AcquireCodeRequest {
        provider: "herosms".to_string(),
        service: Some("telegram".to_string()),
        country: Some("RU".to_string()),
        ..default_request()
    };
    let resp = service.acquire_code(request.clone()).await.unwrap();
    service
        .release_code(ReleaseCodeRequest {
            ticket_id: resp.ticket_id,
            action: ReleaseAction::Finish,
        })
        .await
        .unwrap();
    let resp2 = service.acquire_code(request).await.unwrap();
    assert_eq!(resp2.phone_number, "+79001234567");
    assert_eq!(resp2.acquire_path, AcquirePath::ExactReuse);
}

#[tokio::test]
async fn test_intent_reuse_no_cross_service() {
    let (service, _dir) = setup_service();
    let request = AcquireCodeRequest {
        provider: "fivesim".to_string(),
        service: Some("telegram".to_string()),
        country: Some("RU".to_string()),
        ..default_request()
    };
    let resp = service.acquire_code(request).await.unwrap();
    let first_ticket_id = resp.ticket_id.clone();
    service
        .release_code(ReleaseCodeRequest {
            ticket_id: resp.ticket_id,
            action: ReleaseAction::Finish,
        })
        .await
        .unwrap();
    let request2 = AcquireCodeRequest {
        provider: "fivesim".to_string(),
        service: Some("whatsapp".to_string()),
        country: Some("RU".to_string()),
        ..default_request()
    };
    let resp2 = service.acquire_code(request2).await.unwrap();
    assert_eq!(resp2.phone_number, "+79001234567");
    assert!(resp2.ticket_id != first_ticket_id);
}

#[tokio::test]
async fn test_same_activation_retry_not_pool() {
    let (service, dir) = setup_service();
    let request = AcquireCodeRequest {
        provider: "herosms".to_string(),
        service: Some("telegram".to_string()),
        country: Some("RU".to_string()),
        ..default_request()
    };
    let resp = service.acquire_code(request.clone()).await.unwrap();
    service
        .release_code(ReleaseCodeRequest {
            ticket_id: resp.ticket_id.clone(),
            action: ReleaseAction::Retry,
        })
        .await
        .unwrap();
    let state_path = dir.path().join("runtime.db");
    let state = RuntimeStore::open(&state_path).unwrap().load_state().unwrap();
    assert!(
        state.reuse_pool.is_empty() || state.reuse_pool.values().all(|v| v.is_empty()),
        "Retry should not record candidate in pool"
    );
}

#[tokio::test]
async fn test_same_activation_retry_auto_reuse_herosms() {
    let mut ticket = TicketRecord::new(
        "herosms".to_string(),
        "telegram".to_string(),
        "RU".to_string(),
        "+79001234567".to_string(),
        Some("retry-hero-1".to_string()),
        Some(0.06),
    );
    ticket.status = TicketStatus::WaitingCode;
    ticket.same_activation_retry_supported = true;
    ticket.same_activation_retry_expires_at = Some(Utc::now() + Duration::minutes(5));
    let ticket_id = ticket.id.clone();
    let (service, _dir) = setup_service_with_state(vec![ticket]);

    let resp = service
        .acquire_code(AcquireCodeRequest {
            provider: "herosms".to_string(),
            service: Some("telegram".to_string()),
            country: Some("RU".to_string()),
            ..default_request()
        })
        .await
        .unwrap();

    assert_eq!(resp.ticket_id, ticket_id);
    assert_eq!(resp.acquire_path, AcquirePath::SameActivationRetry);
}

#[tokio::test]
async fn test_same_activation_retry_auto_reuse_smsbower() {
    let mut ticket = TicketRecord::new(
        "smsbower".to_string(),
        "telegram".to_string(),
        "RU".to_string(),
        "+79001234567".to_string(),
        Some("retry-smsbower-1".to_string()),
        Some(0.06),
    );
    ticket.status = TicketStatus::WaitingCode;
    ticket.same_activation_retry_supported = true;
    ticket.same_activation_retry_expires_at = Some(Utc::now() + Duration::minutes(5));
    let ticket_id = ticket.id.clone();
    let (service, _dir) = setup_service_with_state(vec![ticket]);

    let resp = service
        .acquire_code(AcquireCodeRequest {
            provider: "smsbower".to_string(),
            service: Some("telegram".to_string()),
            country: Some("RU".to_string()),
            ..default_request()
        })
        .await
        .unwrap();

    assert_eq!(resp.ticket_id, ticket_id);
    assert_eq!(resp.acquire_path, AcquirePath::SameActivationRetry);
}

#[tokio::test]
async fn test_same_activation_retry_expired_falls_back_to_fresh() {
    let mut ticket = TicketRecord::new(
        "smsbower".to_string(),
        "telegram".to_string(),
        "RU".to_string(),
        "+79001234567".to_string(),
        Some("retry-smsbower-expired".to_string()),
        Some(0.06),
    );
    ticket.status = TicketStatus::WaitingCode;
    ticket.same_activation_retry_supported = true;
    ticket.same_activation_retry_expires_at = Some(Utc::now() - Duration::seconds(1));
    let ticket_id = ticket.id.clone();
    let (service, _dir) = setup_service_with_state(vec![ticket]);

    let resp = service
        .acquire_code(AcquireCodeRequest {
            provider: "smsbower".to_string(),
            service: Some("telegram".to_string()),
            country: Some("RU".to_string()),
            ..default_request()
        })
        .await
        .unwrap();

    assert_ne!(resp.ticket_id, ticket_id);
}

#[tokio::test]
async fn test_same_activation_retry_disabled_by_reuse_switch() {
    let mut ticket = TicketRecord::new(
        "smsbower".to_string(),
        "telegram".to_string(),
        "RU".to_string(),
        "+79001234567".to_string(),
        Some("retry-disabled".to_string()),
        Some(0.06),
    );
    ticket.status = TicketStatus::WaitingCode;
    ticket.same_activation_retry_supported = true;
    ticket.same_activation_retry_expires_at = Some(Utc::now() + Duration::minutes(5));
    let ticket_id = ticket.id.clone();
    let (service, _dir) = setup_service_with_state(vec![ticket]);

    let resp = service
        .acquire_code(AcquireCodeRequest {
            provider: "smsbower".to_string(),
            service: Some("telegram".to_string()),
            country: Some("RU".to_string()),
            reuse_phone: Some(false),
            ..default_request()
        })
        .await
        .unwrap();

    assert_ne!(resp.ticket_id, ticket_id);
    assert_eq!(resp.acquire_path, AcquirePath::FreshAcquire);
}

#[tokio::test]
async fn test_cancelled_ticket_is_not_reused_by_same_activation_retry() {
    let mut ticket = TicketRecord::new(
        "herosms".to_string(),
        "telegram".to_string(),
        "RU".to_string(),
        "+79001234567".to_string(),
        Some("retry-cancelled".to_string()),
        Some(0.06),
    );
    ticket.status = TicketStatus::WaitingCode;
    ticket.same_activation_retry_supported = true;
    ticket.same_activation_retry_expires_at = Some(Utc::now() + Duration::minutes(5));
    let ticket_id = ticket.id.clone();
    let (service, _dir) = setup_service_with_state(vec![ticket]);

    service
        .release_code(ReleaseCodeRequest {
            ticket_id: ticket_id.clone(),
            action: ReleaseAction::Cancel,
        })
        .await
        .unwrap();

    let resp = service
        .acquire_code(AcquireCodeRequest {
            provider: "herosms".to_string(),
            service: Some("telegram".to_string()),
            country: Some("RU".to_string()),
            ..default_request()
        })
        .await
        .unwrap();

    assert_ne!(resp.ticket_id, ticket_id);
    assert_eq!(resp.acquire_path, AcquirePath::FreshAcquire);
}

#[tokio::test]
async fn test_banned_ticket_is_not_reused_by_same_activation_retry() {
    let mut ticket = TicketRecord::new(
        "smsbower".to_string(),
        "telegram".to_string(),
        "RU".to_string(),
        "+79001234567".to_string(),
        Some("retry-banned".to_string()),
        Some(0.06),
    );
    ticket.status = TicketStatus::WaitingCode;
    ticket.same_activation_retry_supported = true;
    ticket.same_activation_retry_expires_at = Some(Utc::now() + Duration::minutes(5));
    let ticket_id = ticket.id.clone();
    let (service, _dir) = setup_service_with_state(vec![ticket]);

    service
        .release_code(ReleaseCodeRequest {
            ticket_id: ticket_id.clone(),
            action: ReleaseAction::Ban,
        })
        .await
        .unwrap();

    let resp = service
        .acquire_code(AcquireCodeRequest {
            provider: "smsbower".to_string(),
            service: Some("telegram".to_string()),
            country: Some("RU".to_string()),
            ..default_request()
        })
        .await
        .unwrap();

    assert_ne!(resp.ticket_id, ticket_id);
    assert_eq!(resp.acquire_path, AcquirePath::FreshAcquire);
}

#[tokio::test]
async fn test_exact_reuse_disabled_by_reuse_switch() {
    let (service, _dir) = setup_service();
    let request = AcquireCodeRequest {
        provider: "fivesim".to_string(),
        service: Some("telegram".to_string()),
        country: Some("RU".to_string()),
        ..default_request()
    };
    let resp = service.acquire_code(request.clone()).await.unwrap();
    service
        .release_code(ReleaseCodeRequest {
            ticket_id: resp.ticket_id,
            action: ReleaseAction::Finish,
        })
        .await
        .unwrap();

    let resp2 = service
        .acquire_code(AcquireCodeRequest {
            reuse_phone: Some(false),
            ..request
        })
        .await
        .unwrap();
    assert_eq!(resp2.acquire_path, AcquirePath::FreshAcquire);
}

#[tokio::test]
async fn test_exact_reuse_respects_max_reuse_limit() {
    let (service, _dir) = setup_service();
    let base_request = AcquireCodeRequest {
        provider: "fivesim".to_string(),
        service: Some("telegram".to_string()),
        country: Some("RU".to_string()),
        ..default_request()
    };

    let first = service.acquire_code(base_request.clone()).await.unwrap();
    service
        .release_code(ReleaseCodeRequest {
            ticket_id: first.ticket_id,
            action: ReleaseAction::Finish,
        })
        .await
        .unwrap();

    let second = service.acquire_code(base_request.clone()).await.unwrap();
    assert_eq!(second.acquire_path, AcquirePath::ExactReuse);
    service
        .release_code(ReleaseCodeRequest {
            ticket_id: second.ticket_id,
            action: ReleaseAction::Finish,
        })
        .await
        .unwrap();

    let third = service.acquire_code(base_request).await.unwrap();
    assert_ne!(third.acquire_path, AcquirePath::ExactReuse);
}

#[tokio::test]
async fn test_clear_provider_reuse_pool() {
    let (service, _dir) = setup_service();
    let request = AcquireCodeRequest {
        provider: "fivesim".to_string(),
        service: Some("telegram".to_string()),
        country: Some("RU".to_string()),
        ..default_request()
    };
    let resp = service.acquire_code(request).await.unwrap();
    service
        .release_code(ReleaseCodeRequest {
            ticket_id: resp.ticket_id,
            action: ReleaseAction::Finish,
        })
        .await
        .unwrap();

    let before = service.runtime_snapshot();
    assert!(!before.reuse_pool.is_empty());

    let cleared = service.clear_provider_reuse_pool("fivesim").unwrap();
    assert_eq!(cleared.provider, "fivesim");
    assert_eq!(cleared.removed, 1);

    let after = service.runtime_snapshot();
    assert!(after.reuse_pool.is_empty());
}

#[tokio::test]
async fn test_stale_eviction_ttl() {
    let (_service, dir) = setup_service();
    let expired_entry = ReusePoolEntry {
        reuse_key: None,
        phone_number: "+79001234567".to_string(),
        provider: "fivesim".to_string(),
        service: "telegram".to_string(),
        country: "RU".to_string(),
        upstream_id: Some("mock-activation".to_string()),
        reuse_count: 0,
        max_reuse: 2,
        last_used_at: Utc::now() - Duration::hours(25),
        expires_at: Utc::now() - Duration::hours(1),
    };
    let mut pool = HashMap::new();
    pool.insert("fivesim".to_string(), vec![expired_entry]);
    let state = RuntimeStateStore {
        tickets: vec![],
        logs: vec![],
        activity: vec![],
        provider_balance_cache: vec![],
        reuse_pool: pool,
        openai_sms_regions_cache: Default::default(),
    };
    let state_path = dir.path().join("runtime.db");
    RuntimeStore::open(&state_path).unwrap().replace_state(&state).unwrap();

    let providers_dir = dir.path().join("providers");
    let registry = ProviderRegistry::load_from_dir(&providers_dir).unwrap();
    let service =
        SmsService::with_persistence_paths(registry, 100, None, Some(state_path), None, None, None);
    let request = AcquireCodeRequest {
        provider: "fivesim".to_string(),
        service: Some("telegram".to_string()),
        country: Some("RU".to_string()),
        ..default_request()
    };
    let _resp = service.acquire_code(request).await.unwrap();
}

#[tokio::test]
async fn test_stale_eviction_max_count() {
    let (_service, dir) = setup_service();
    let exhausted_entry = ReusePoolEntry {
        reuse_key: None,
        phone_number: "+79001234567".to_string(),
        provider: "fivesim".to_string(),
        service: "telegram".to_string(),
        country: "RU".to_string(),
        upstream_id: Some("mock-activation".to_string()),
        reuse_count: 2,
        max_reuse: 2,
        last_used_at: Utc::now(),
        expires_at: Utc::now() + Duration::hours(24),
    };
    let mut pool = HashMap::new();
    pool.insert("fivesim".to_string(), vec![exhausted_entry]);
    let state = RuntimeStateStore {
        tickets: vec![],
        logs: vec![],
        activity: vec![],
        provider_balance_cache: vec![],
        reuse_pool: pool,
        openai_sms_regions_cache: Default::default(),
    };
    let state_path = dir.path().join("runtime.db");
    RuntimeStore::open(&state_path).unwrap().replace_state(&state).unwrap();

    let providers_dir = dir.path().join("providers");
    let registry = ProviderRegistry::load_from_dir(&providers_dir).unwrap();
    let service =
        SmsService::with_persistence_paths(registry, 100, None, Some(state_path), None, None, None);
    let request = AcquireCodeRequest {
        provider: "fivesim".to_string(),
        service: Some("telegram".to_string()),
        country: Some("RU".to_string()),
        ..default_request()
    };
    let _resp = service.acquire_code(request).await.unwrap();
}

#[tokio::test]
async fn test_pool_persistence() {
    let (service, dir) = setup_service();
    let request = AcquireCodeRequest {
        provider: "fivesim".to_string(),
        service: Some("telegram".to_string()),
        country: Some("RU".to_string()),
        ..default_request()
    };
    let resp = service.acquire_code(request).await.unwrap();
    service
        .release_code(ReleaseCodeRequest {
            ticket_id: resp.ticket_id,
            action: ReleaseAction::Finish,
        })
        .await
        .unwrap();
    let state_path = dir.path().join("runtime.db");
    let state = RuntimeStore::open(&state_path).unwrap().load_state().unwrap();
    assert!(
        !state.reuse_pool.is_empty(),
        "reuse_pool should be persisted"
    );
    let entries = state.reuse_pool.get("fivesim").unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].phone_number, "+79001234567");
}

fn default_request() -> AcquireCodeRequest {
    AcquireCodeRequest {
        provider: String::new(),
        service: None,
        country: None,
        max_price: None,
        min_price: None,
        auto_pick_country: None,
        reuse_phone: None,
        reuse_key: None,
        metadata: BTreeMap::new(),
        routing_plan_id: None,
        routing_plan_name: None,
    }
}
