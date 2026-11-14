"""friends: friendships, trip_invites, user_profiles.friend_code

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-14
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user_profiles", sa.Column("friend_code", sa.String(8), nullable=True))
    op.create_unique_constraint("user_profiles_friend_code_unique", "user_profiles", ["friend_code"])
    op.create_table(
        "friendships",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("requester_id", sa.Uuid(), sa.ForeignKey("user_profiles.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("addressee_id", sa.Uuid(), sa.ForeignKey("user_profiles.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('pending', 'accepted')", name="friendships_status_valid"),
        sa.CheckConstraint("requester_id <> addressee_id", name="friendships_not_self"),
    )
    # 두 사람 사이에는 관계가 하나뿐이다(누가 먼저 요청했든).
    op.execute("CREATE UNIQUE INDEX friendships_one_per_pair ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))")
    op.create_index("friendships_addressee_idx", "friendships", ["addressee_id"])
    op.create_table(
        "trip_invites",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("trip_id", sa.Uuid(), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invitee_id", sa.Uuid(), sa.ForeignKey("user_profiles.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("inviter_id", sa.Uuid(), sa.ForeignKey("user_profiles.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("trip_id", "invitee_id", name="trip_invites_one_per_user"),
    )
    op.create_index("trip_invites_invitee_idx", "trip_invites", ["invitee_id"])
    op.execute("ALTER TABLE friendships ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE trip_invites ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("trip_invites")
    op.drop_table("friendships")
    op.drop_constraint("user_profiles_friend_code_unique", "user_profiles", type_="unique")
    op.drop_column("user_profiles", "friend_code")
