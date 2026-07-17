from artimis.engine.intelligence import _safe_session_name


def test_safe_session_name_falls_back_when_model_returns_empty():
    assert _safe_session_name("", "reply with exactly: browser-ok") == "reply with exactly: browser-ok"


def test_safe_session_name_strips_quotes_and_punctuation():
    assert _safe_session_name('"Freight Lane Audit."', "fallback") == "Freight Lane Audit"


def test_safe_session_name_truncates_long_names():
    name = _safe_session_name("x" * 120, "fallback")
    assert len(name) <= 60
    assert name.endswith("...")


def test_safe_session_name_has_final_non_empty_fallback():
    assert _safe_session_name("", "   ") == "New Chat"
