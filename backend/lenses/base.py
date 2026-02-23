"""Base lens utilities and registry."""

from lenses.class_lecture import LENS as class_lecture
from lenses.startup_meeting import LENS as startup_meeting
from lenses.research_discussion import LENS as research_discussion
from lenses.working_session import LENS as working_session
from lenses.talk_seminar import LENS as talk_seminar

PRESET_LENSES = {
    "class_lecture": class_lecture,
    "startup_meeting": startup_meeting,
    "research_discussion": research_discussion,
    "working_session": working_session,
    "talk_seminar": talk_seminar,
}


def get_lens(lens_id: str) -> dict | None:
    return PRESET_LENSES.get(lens_id)


def list_lenses() -> list[dict]:
    return [
        {
            "id": lid,
            "name": lens["name"],
            "description": lens["description"],
            "context": lid,
        }
        for lid, lens in PRESET_LENSES.items()
    ]
