from sqlalchemy import text


def test_health_needs_no_login(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_unknown_path_is_404_in_common_error_format(client):
    response = client.get("/no-such-path")

    assert response.status_code == 404
    assert response.json() == {
        "code": "not_found",
        "message": "찾을 수 없습니다.",
        "details": [],
    }


def test_every_table_denies_client_access(engine):
    """ADR-0002: 모든 테이블에 RLS가 켜져 있고 클라이언트용 정책이 하나도 없다."""
    with engine.connect() as conn:
        without_rls = conn.scalars(
            text(
                "SELECT c.relname FROM pg_class c "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = 'public' AND c.relkind = 'r' "
                "AND NOT c.relrowsecurity"
            )
        ).all()
        policies = conn.scalars(
            text("SELECT policyname FROM pg_policies WHERE schemaname = 'public'")
        ).all()

    assert without_rls == []
    assert policies == []
