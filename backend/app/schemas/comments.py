from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class CommentResponse(BaseModel):
    id: str
    session_id: str
    room_id: str
    author: str
    text: str
    created_at: datetime
    reply_to_message_id: Optional[str] = None
    reply_to_author: Optional[str] = None
    reply_to_text: Optional[str] = None
    commerce_actions: Optional[List[Dict[str, Any]]] = None

    @classmethod
    def from_model(cls, comment) -> "CommentResponse":
        return cls(
            id=comment.id,
            session_id=str(comment.session_id),
            room_id=comment.room_id,
            author=comment.author_display_name,
            text=comment.text,
            created_at=comment.created_at,
            reply_to_message_id=comment.reply_to_comment_id,
            reply_to_author=comment.reply_to_author,
            reply_to_text=comment.reply_to_text,
            commerce_actions=comment.commerce_actions,
        )


class CommentHistoryResponse(BaseModel):
    room_id: str
    comments: list[CommentResponse]
    next_before: Optional[str] = None
