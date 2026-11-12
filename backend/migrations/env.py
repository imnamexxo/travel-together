from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app import models  # noqa: F401  (메타데이터에 테이블 등록)
from app.config import load_settings
from app.db import Base

config = context.config
if config.config_file_name is not None:
    # 테스트처럼 같은 프로세스에서 마이그레이션을 돌려도 앱 로그(app.*)가 꺼지지 않게 한다.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _database_url() -> str:
    # 테스트는 sqlalchemy.url을 직접 넣는다. 그 외에는 DATABASE_URL을 쓴다.
    url = config.get_main_option("sqlalchemy.url") or load_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL이 설정되지 않았습니다.")
    return url


def run_migrations_offline() -> None:
    context.configure(url=_database_url(), target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_database_url())
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
