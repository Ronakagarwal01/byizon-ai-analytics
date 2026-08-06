from __future__ import annotations

import unittest

from backend.ai.orchestrator import _conversation_fallback


class ConversationMemoryFallbackTests(unittest.TestCase):
    def test_recalls_name_from_recent_hinglish_message(self) -> None:
        history = [{"role": "user", "text": "Mera naam Ronak hai."}]
        answer = _conversation_fallback("Mera naam kya hai?", history, True)
        self.assertIn("Ronak", answer)

    def test_recalls_favourite_colour_across_languages(self) -> None:
        history = [{"role": "user", "text": "Mera favourite colour blue hai."}]
        answer = _conversation_fallback("What colour did I tell you?", history, True)
        self.assertIn("blue", answer.lower())

    def test_fresh_chat_does_not_invent_personal_memory(self) -> None:
        answer = _conversation_fallback("Mera naam kya hai?", [], True)
        self.assertIn("nahi pata", answer.lower())


if __name__ == "__main__":
    unittest.main()
