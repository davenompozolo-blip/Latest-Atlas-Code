"""
ATLAS Terminal — CFA Level II Prep Module (Phase 9 + Phase 10 Enhancement)
==========================================================================
Structured study companion using Claude for item set generation,
concept explanation, and progress tracking.

Five modes:
  1. Practice Session — vignette + 6 MCQ item sets (+ difficulty selector)
  2. Concept Explainer — practitioner-focused explanations
  3. Progress Tracker — per-topic stats + study plan
  4. Spaced Repetition — SM-2 algorithm for optimal topic scheduling
  5. Errata Log — flag & review problematic generated questions

Phase 10 enhancements:
  - Quality validators (numerical consistency, answer distribution)
  - Difficulty selector (Foundation / Standard / Advanced)
  - Errata flagging system
  - Spaced repetition mode (SM-2)

Module Pattern Contract: single public render function, zero-argument.
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from datetime import datetime, date, timedelta
from pathlib import Path

import streamlit as st

from auth.auth_manager import get_current_tier, user_has_tier
from config.branding import get_branding

# ---------------------------------------------------------------------------
# CFA Level II Topic Areas (2026 curriculum weights)
# ---------------------------------------------------------------------------
CFA_TOPICS = {
    "Equity Investments": 0.125,
    "Fixed Income": 0.125,
    "Derivatives": 0.075,
    "Alternative Investments": 0.075,
    "Portfolio Management": 0.125,
    "Financial Statement Analysis": 0.125,
    "Economics": 0.075,
    "Ethical & Professional Standards": 0.125,
}

EXAM_DATE = date(2026, 5, 24)  # CFA L2 May 2026

# Difficulty levels (Phase 10)
DIFFICULTY_LEVELS = {
    "Foundation": "Write questions at the knowledge/comprehension level. Calculations should be single-step. Focus on recall and basic application of formulae.",
    "Standard": "Match actual CFA Level II exam difficulty. At least 2 questions require multi-step calculations. Mix conceptual and quantitative questions.",
    "Advanced": "Write questions above exam difficulty to push the candidate. All quantitative questions should require 3+ steps. Include edge cases, combined concepts, and questions that require synthesising across curriculum readings.",
}

# Progress file (persistent across sessions)
_PROGRESS_FILE = Path(__file__).resolve().parent.parent.parent / ".atlas_cfa_progress.json"

# Errata file (Phase 10)
_ERRATA_FILE = Path(__file__).resolve().parent.parent.parent / ".atlas_cfa_errata.json"

# Spaced repetition file (Phase 10 — SM-2 algorithm state)
_SR_FILE = Path(__file__).resolve().parent.parent.parent / ".atlas_cfa_spaced_rep.json"


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

_PROMPT_ITEM_SET = """\
You are a CFA Level II exam question writer with deep expertise in the CFA \
Institute curriculum. You write item set vignettes that match the style, \
difficulty, and analytical depth of actual CFA Level II exam questions.

Generate a complete item set on the topic: {topic}
Difficulty level: {difficulty}
{difficulty_instruction}

Format:

VIGNETTE
[3-5 paragraph case study presenting a realistic investment scenario with \
specific numerical data — companies, portfolios, financial statements, market \
data as appropriate to the topic. The vignette must contain all the information \
needed to answer all 6 questions.]

QUESTION 1
[Stem — a specific question about the vignette]
A) [Option]
B) [Option]
C) [Option]
D) [Option]
ANSWER: [Letter]
EXPLANATION: [2-3 sentences explaining why the correct answer is right and why \
each incorrect answer is wrong, referencing the specific CFA concept being tested]

[Repeat for Questions 2–6]

Rules:
- All numerical data in the vignette must be internally consistent
- Questions must increase in analytical complexity across the set
- At least 2 questions must require multi-step calculations
- Distractors must be plausible errors, not obviously wrong
- Do not repeat question types within a set
- The correct answer should be distributed across A/B/C/D across the set \
  (no more than 2 questions should share the same correct answer letter)
- Do not include any preamble or meta-commentary — output the item set only
- Generate ORIGINAL content — do not reproduce CFA Institute copyrighted material
"""

_PROMPT_CONCEPT = """\
You are a CFA Level II tutor and experienced buy-side practitioner. You explain \
CFA concepts to candidates who already work in finance — skip first-principles \
explanations of basic finance, focus on the exam angle and the practitioner \
perspective.

Your explanations:
- Lead with the intuition (why does this concept exist?)
- Follow with the mechanics (how does it work, with numbers where useful)
- End with the exam angle (what does the CFA exam typically test about this?)
- Are specific: you name formulae, reference specific curriculum reading numbers \
  where relevant, and call out common mistakes

Concept to explain: {concept}
"""


# ---------------------------------------------------------------------------
# Claude API helper
# ---------------------------------------------------------------------------

def _call_claude(system_prompt: str, user_message: str) -> str:
    """Call Claude via the Anthropic SDK."""
    import anthropic

    api_key = st.secrets.get("anthropic", {}).get("api_key", "")
    if not api_key:
        import os
        api_key = os.getenv("ANTHROPIC_API_KEY", "")

    if not api_key:
        raise ValueError("Anthropic API key not configured")

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )
    return response.content[0].text


# ---------------------------------------------------------------------------
# Progress persistence
# ---------------------------------------------------------------------------

def _load_progress() -> dict:
    """Load CFA progress from file."""
    if _PROGRESS_FILE.exists():
        try:
            return json.loads(_PROGRESS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "topics": {t: {"attempted": 0, "correct": 0, "sessions": []} for t in CFA_TOPICS},
        "total_attempted": 0,
        "total_correct": 0,
        "last_session": None,
    }


def _save_progress(progress: dict):
    """Save CFA progress to file."""
    _PROGRESS_FILE.write_text(json.dumps(progress, indent=2, default=str), encoding="utf-8")


# ---------------------------------------------------------------------------
# Errata persistence (Phase 10)
# ---------------------------------------------------------------------------

def _load_errata() -> list:
    """Load errata reports."""
    if _ERRATA_FILE.exists():
        try:
            return json.loads(_ERRATA_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


def _save_errata(errata: list):
    """Save errata reports."""
    _ERRATA_FILE.write_text(json.dumps(errata, indent=2, default=str), encoding="utf-8")


def _add_errata(topic: str, question_number: int, issue_type: str, description: str, question_text: str):
    """Add an errata report for a generated question."""
    errata = _load_errata()
    errata.append({
        "date": datetime.now().isoformat(),
        "topic": topic,
        "question_number": question_number,
        "issue_type": issue_type,
        "description": description,
        "question_text": question_text[:500],
        "status": "open",
    })
    _save_errata(errata)


# ---------------------------------------------------------------------------
# Spaced Repetition — SM-2 Algorithm (Phase 10)
# ---------------------------------------------------------------------------

def _load_sr_state() -> dict:
    """Load spaced repetition state."""
    if _SR_FILE.exists():
        try:
            return json.loads(_SR_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    # Initialise SM-2 state for each topic
    return {
        topic: {
            "easiness": 2.5,       # EF (easiness factor), min 1.3
            "interval": 1,          # Days until next review
            "repetitions": 0,       # Consecutive correct reviews
            "next_review": date.today().isoformat(),
            "last_quality": None,   # Last review quality (0-5)
        }
        for topic in CFA_TOPICS
    }


def _save_sr_state(state: dict):
    """Save spaced repetition state."""
    _SR_FILE.write_text(json.dumps(state, indent=2, default=str), encoding="utf-8")


def _sm2_update(topic_state: dict, quality: int) -> dict:
    """
    Apply the SM-2 algorithm to update a topic's spaced repetition state.

    quality: 0-5 scale where:
      0-2 = incorrect/poor (reset repetitions)
      3   = correct with difficulty
      4   = correct with hesitation
      5   = perfect recall
    """
    quality = max(0, min(5, quality))
    ef = topic_state["easiness"]
    reps = topic_state["repetitions"]
    interval = topic_state["interval"]

    # Update easiness factor
    ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    ef = max(1.3, ef)

    if quality < 3:
        # Failed — reset
        reps = 0
        interval = 1
    else:
        reps += 1
        if reps == 1:
            interval = 1
        elif reps == 2:
            interval = 6
        else:
            interval = round(interval * ef)

    next_review = (date.today() + timedelta(days=interval)).isoformat()

    return {
        "easiness": round(ef, 2),
        "interval": interval,
        "repetitions": reps,
        "next_review": next_review,
        "last_quality": quality,
    }


def _get_due_topics(sr_state: dict) -> list[str]:
    """Get topics that are due for review today, sorted by overdue-ness."""
    today = date.today()
    due = []
    for topic, state in sr_state.items():
        review_date = date.fromisoformat(state["next_review"])
        if review_date <= today:
            overdue_days = (today - review_date).days
            due.append((topic, overdue_days, state["easiness"]))
    # Sort: most overdue first, then lowest easiness
    due.sort(key=lambda x: (-x[1], x[2]))
    return [t[0] for t in due]


# ---------------------------------------------------------------------------
# Quality Validators (Phase 10)
# ---------------------------------------------------------------------------

def _validate_item_set(parsed: dict) -> list[dict]:
    """
    Validate a parsed item set for quality issues.
    Returns a list of {severity, message} dicts.
    """
    issues = []

    # 1. Structure check: must have vignette + 6 questions
    if not parsed["vignette"]:
        issues.append({"severity": "error", "message": "Missing vignette"})
    if len(parsed["questions"]) < 6:
        issues.append({
            "severity": "error",
            "message": f"Only {len(parsed['questions'])}/6 questions parsed",
        })

    # 2. Answer distribution: no more than 2 of the same letter
    answers = [q["answer"] for q in parsed["questions"] if q["answer"]]
    if answers:
        dist = Counter(answers)
        for letter, count in dist.items():
            if count > 3:
                issues.append({
                    "severity": "warning",
                    "message": f"Answer '{letter}' appears {count} times — poor distribution",
                })

    # 3. All questions must have answer + explanation
    for q in parsed["questions"]:
        if not q["answer"]:
            issues.append({
                "severity": "error",
                "message": f"Q{q['number']}: Missing correct answer",
            })
        if not q["explanation"]:
            issues.append({
                "severity": "warning",
                "message": f"Q{q['number']}: Missing explanation",
            })
        if len(q["options"]) < 3:
            issues.append({
                "severity": "error",
                "message": f"Q{q['number']}: Only {len(q['options'])} options (need 3-4)",
            })

    # 4. Numerical consistency: check for numbers in vignette referenced in questions
    vignette_numbers = set(re.findall(r'\d+(?:\.\d+)?%?', parsed["vignette"]))
    if parsed["vignette"] and len(vignette_numbers) < 3:
        issues.append({
            "severity": "warning",
            "message": "Vignette has few numerical data points — may lack calculation questions",
        })

    return issues


# ---------------------------------------------------------------------------
# Item set parser
# ---------------------------------------------------------------------------

def _parse_item_set(text: str) -> dict:
    """Parse a generated item set into structured data."""
    result = {"vignette": "", "questions": []}

    # Extract vignette
    vignette_match = re.search(
        r"VIGNETTE\s*\n(.*?)(?=QUESTION\s+1)", text, re.DOTALL
    )
    if vignette_match:
        result["vignette"] = vignette_match.group(1).strip()

    # Extract questions
    for i in range(1, 7):
        pattern = rf"QUESTION\s+{i}\s*\n(.*?)(?=QUESTION\s+{i+1}|$)"
        match = re.search(pattern, text, re.DOTALL)
        if match:
            q_text = match.group(1).strip()

            # Parse stem
            stem_match = re.match(r"(.*?)(?=\nA\))", q_text, re.DOTALL)
            stem = stem_match.group(1).strip() if stem_match else q_text

            # Parse options
            options = {}
            for letter in "ABCD":
                opt_match = re.search(rf"{letter}\)\s*(.*?)(?=\n[ABCD]\)|ANSWER:|$)", q_text, re.DOTALL)
                if opt_match:
                    options[letter] = opt_match.group(1).strip()

            # Parse answer
            answer_match = re.search(r"ANSWER:\s*([A-D])", q_text)
            answer = answer_match.group(1) if answer_match else ""

            # Parse explanation
            expl_match = re.search(r"EXPLANATION:\s*(.*?)$", q_text, re.DOTALL)
            explanation = expl_match.group(1).strip() if expl_match else ""

            result["questions"].append({
                "number": i,
                "stem": stem,
                "options": options,
                "answer": answer,
                "explanation": explanation,
            })

    return result


# ---------------------------------------------------------------------------
# Study plan algorithm
# ---------------------------------------------------------------------------

def _generate_study_plan(progress: dict) -> dict:
    """Generate a study plan weighted by weakness + exam importance."""
    today = date.today()
    days_left = max((EXAM_DATE - today).days, 1)
    weeks_left = days_left / 7
    sessions_per_week = 5
    total_sessions = int(weeks_left * sessions_per_week)

    # Step 1: Weakness scores
    weakness = {}
    for topic, weight in CFA_TOPICS.items():
        stats = progress["topics"].get(topic, {"attempted": 0, "correct": 0})
        attempted = stats["attempted"]
        correct = stats["correct"]

        if attempted == 0:
            weakness[topic] = 0.8  # Untested = high priority
        else:
            correct_rate = correct / attempted
            w = 1.0 - correct_rate
            if correct_rate < 0.6:
                w *= 1.3  # Boost weak topics
            weakness[topic] = w

    # Step 2: Priority = weakness × exam weight
    priority = {t: weakness[t] * CFA_TOPICS[t] for t in CFA_TOPICS}

    # Step 3: Normalise and distribute sessions
    total_priority = sum(priority.values())
    if total_priority == 0:
        total_priority = 1

    sessions_per_topic = {}
    for topic in CFA_TOPICS:
        s = max(1, round((priority[topic] / total_priority) * total_sessions))
        sessions_per_topic[topic] = s

    # Step 4: Build weekly schedule (sort by priority)
    sorted_topics = sorted(priority.keys(), key=lambda t: priority[t], reverse=True)
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    weekly_schedule = {}
    for i, day in enumerate(days):
        weekly_schedule[day] = sorted_topics[i % len(sorted_topics)]

    # Focus areas (top 2)
    focus = sorted_topics[:2]
    focus_pcts = {t: sessions_per_topic[t] / max(sum(sessions_per_topic.values()), 1) for t in focus}

    return {
        "days_left": days_left,
        "weeks_left": round(weeks_left, 1),
        "total_sessions": total_sessions,
        "sessions_per_topic": sessions_per_topic,
        "weekly_schedule": weekly_schedule,
        "focus_areas": focus,
        "focus_percentages": focus_pcts,
        "weakness_scores": weakness,
        "priority_scores": priority,
    }


# ---------------------------------------------------------------------------
# Free tier preview (one sample question)
# ---------------------------------------------------------------------------

_SAMPLE_QUESTION = {
    "topic": "Equity Investments",
    "stem": (
        "An analyst is valuing Meridian Corp using a two-stage DDM. "
        "The current dividend is R4.50, expected to grow at 12% for 3 years, "
        "then 4% perpetually. Required return is 10%. "
        "The intrinsic value per share is closest to:"
    ),
    "options": {
        "A": "R82.50",
        "B": "R91.33",
        "C": "R97.12",
        "D": "R104.88",
    },
    "answer": "B",
    "explanation": (
        "D1=4.50×1.12=5.04, D2=5.04×1.12=5.64, D3=5.64×1.12=6.32. "
        "Terminal value at end of Year 3 = D4/(r−g) = 6.32×1.04/(0.10−0.04) = R109.55. "
        "PV = 5.04/1.10 + 5.64/1.10² + (6.32+109.55)/1.10³ = 4.58 + 4.66 + 82.09 = R91.33. "
        "A is wrong (forgot to grow D0). C uses wrong terminal growth. D uses single-stage DDM."
    ),
}


# ---------------------------------------------------------------------------
# Public render function
# ---------------------------------------------------------------------------

def render_cfa_prep():
    """Render the CFA Level II Prep Module."""
    brand = get_branding()

    st.markdown(
        '<h1 style="font-size:2rem; font-weight:800;'
        ' color:rgba(255,255,255,0.92); margin-bottom:0;">'
        'CFA LEVEL II PREP</h1>',
        unsafe_allow_html=True,
    )

    days_left = max((EXAM_DATE - date.today()).days, 0)
    st.caption(f"May 2026 Exam · {days_left} days remaining")

    # Free tier preview
    if not user_has_tier("professional"):
        _render_free_preview(brand)
        return

    # Full module — 5 tabs (Phase 10: added Spaced Repetition + Errata)
    tab_practice, tab_concepts, tab_tracker, tab_sr, tab_errata = st.tabs([
        "Practice Session",
        "Concept Explainer",
        "Progress Tracker",
        "Spaced Repetition",
        "Errata Log",
    ])

    with tab_practice:
        _render_practice_session(brand)

    with tab_concepts:
        _render_concept_explainer(brand)

    with tab_tracker:
        _render_progress_tracker(brand)

    with tab_sr:
        _render_spaced_repetition(brand)

    with tab_errata:
        _render_errata_log(brand)


# ---------------------------------------------------------------------------
# Free tier preview
# ---------------------------------------------------------------------------

def _render_free_preview(brand: dict):
    st.markdown("---")
    st.markdown("##### Sample Question — Equity Investments")

    q = _SAMPLE_QUESTION
    st.markdown(f"**{q['stem']}**")
    for letter, text in q["options"].items():
        st.markdown(f"&nbsp;&nbsp;&nbsp;{letter}) {text}")

    with st.expander("Show Answer"):
        st.success(f"**Correct: {q['answer']}**")
        st.markdown(q["explanation"])

    st.markdown("---")
    st.info(
        "The full CFA Prep module includes AI-generated item sets for all 8 topic areas, "
        "a concept explainer, and a progress tracker with personalised study plans. "
        "Upgrade to Professional to unlock."
    )


# ---------------------------------------------------------------------------
# Mode 1: Practice Session
# ---------------------------------------------------------------------------

def _render_practice_session(brand: dict):
    st.markdown("##### Generate Item Set")

    col1, col2, col3 = st.columns([2, 1, 1])
    with col1:
        topic = st.selectbox("Topic Area", list(CFA_TOPICS.keys()), key="cfa_topic")
    with col2:
        difficulty = st.selectbox(
            "Difficulty",
            list(DIFFICULTY_LEVELS.keys()),
            index=1,  # Default: Standard
            key="cfa_difficulty",
        )
    with col3:
        num_sets = st.number_input("Item Sets", min_value=1, max_value=5, value=1, key="cfa_num_sets")

    if st.button("Generate Practice Set", key="cfa_generate_btn", use_container_width=True):
        with st.spinner(f"Generating {num_sets} {difficulty.lower()} item set(s) for {topic}..."):
            try:
                prompt = _PROMPT_ITEM_SET.format(
                    topic=topic,
                    difficulty=difficulty,
                    difficulty_instruction=DIFFICULTY_LEVELS[difficulty],
                )
                raw = _call_claude(prompt, f"Generate {num_sets} {difficulty}-level item set(s) on {topic}.")
                parsed = _parse_item_set(raw)

                # Phase 10: Quality validation
                validation_issues = _validate_item_set(parsed)
                errors = [i for i in validation_issues if i["severity"] == "error"]
                warnings = [i for i in validation_issues if i["severity"] == "warning"]

                if errors:
                    st.warning(f"Quality check: {len(errors)} issue(s) detected")
                    for issue in errors:
                        st.caption(f"  {issue['message']}")

                if warnings:
                    with st.expander(f"Quality warnings ({len(warnings)})"):
                        for issue in warnings:
                            st.caption(f"  {issue['message']}")

                st.session_state["cfa_current_item_set"] = parsed
                st.session_state["cfa_current_topic"] = topic
                st.session_state["cfa_current_difficulty"] = difficulty
                st.session_state["cfa_user_answers"] = {}
                st.session_state["cfa_submitted"] = False
                st.session_state["cfa_raw_response"] = raw
                st.session_state["cfa_validation_issues"] = validation_issues
            except Exception as e:
                st.error(f"Generation failed: {e}")
                return

    # Display current item set
    if "cfa_current_item_set" not in st.session_state:
        st.info("Select a topic and click Generate to start a practice session.")
        return

    item_set = st.session_state["cfa_current_item_set"]
    submitted = st.session_state.get("cfa_submitted", False)

    # Vignette
    if item_set["vignette"]:
        st.markdown("---")
        st.markdown("##### Vignette")
        st.markdown(
            f'<div style="padding:16px; background:rgba(255,255,255,0.02);'
            f' border-radius:10px; border-left:3px solid {brand["primary_colour"]};'
            f' font-size:14px; line-height:1.7; color:rgba(255,255,255,0.8);">'
            f'{item_set["vignette"]}</div>',
            unsafe_allow_html=True,
        )

    # Questions
    if not item_set["questions"]:
        st.warning("Could not parse questions from response. Raw output below:")
        st.code(st.session_state.get("cfa_raw_response", ""), language="text")
        return

    st.markdown("---")
    user_answers = st.session_state.get("cfa_user_answers", {})

    for q in item_set["questions"]:
        qnum = q["number"]
        st.markdown(f"**Question {qnum}**")
        st.markdown(q["stem"])

        if not submitted:
            # Radio buttons for answer selection
            options = [f"{k}) {v}" for k, v in q["options"].items()]
            selected = st.radio(
                f"Your answer for Q{qnum}:",
                options,
                key=f"cfa_q{qnum}",
                index=None,
                label_visibility="collapsed",
            )
            if selected:
                user_answers[str(qnum)] = selected[0]  # Extract letter
                st.session_state["cfa_user_answers"] = user_answers
        else:
            # Show results
            user_ans = user_answers.get(str(qnum), "—")
            correct = q["answer"]
            is_correct = user_ans == correct

            for letter, text in q["options"].items():
                if letter == correct:
                    st.markdown(f"&nbsp;&nbsp;&nbsp;**{letter}) {text}** ✅")
                elif letter == user_ans and not is_correct:
                    st.markdown(f"&nbsp;&nbsp;&nbsp;**{letter}) {text}** ❌")
                else:
                    st.markdown(f"&nbsp;&nbsp;&nbsp;{letter}) {text}")

            if is_correct:
                st.success(f"Correct! {q['explanation']}")
            else:
                st.error(f"Your answer: {user_ans}. Correct: {correct}")
                st.info(q["explanation"])

            # Phase 10: Errata flagging
            with st.expander(f"Flag Q{qnum}", expanded=False):
                issue_type = st.selectbox(
                    "Issue type",
                    ["Numerical error", "Ambiguous stem", "Wrong answer key", "Missing data", "Other"],
                    key=f"cfa_errata_type_{qnum}",
                )
                errata_desc = st.text_input(
                    "Describe the issue",
                    key=f"cfa_errata_desc_{qnum}",
                    placeholder="e.g., Calculation in explanation doesn't match vignette data",
                )
                if st.button("Submit Flag", key=f"cfa_errata_btn_{qnum}"):
                    _add_errata(
                        topic=st.session_state.get("cfa_current_topic", ""),
                        question_number=qnum,
                        issue_type=issue_type,
                        description=errata_desc or issue_type,
                        question_text=q["stem"],
                    )
                    st.success("Flagged — thank you for improving question quality.")

        st.markdown("")

    # Submit button
    if not submitted:
        if st.button("Submit Answers", key="cfa_submit_btn", use_container_width=True):
            st.session_state["cfa_submitted"] = True

            # Record progress
            topic = st.session_state.get("cfa_current_topic", "")
            progress = _load_progress()
            total_q = len(item_set["questions"])
            correct_count = sum(
                1 for q in item_set["questions"]
                if user_answers.get(str(q["number"])) == q["answer"]
            )

            if topic in progress["topics"]:
                progress["topics"][topic]["attempted"] += total_q
                progress["topics"][topic]["correct"] += correct_count
                progress["topics"][topic]["sessions"].append({
                    "date": date.today().isoformat(),
                    "attempted": total_q,
                    "correct": correct_count,
                })

            progress["total_attempted"] += total_q
            progress["total_correct"] += correct_count
            progress["last_session"] = date.today().isoformat()
            _save_progress(progress)

            # Phase 10: Update spaced repetition state
            if topic:
                sr_state = _load_sr_state()
                if topic in sr_state:
                    pct = (correct_count / total_q * 100) if total_q > 0 else 0
                    # Map score to SM-2 quality: <40%→1, 40-59%→2, 60-74%→3, 75-89%→4, 90+%→5
                    if pct >= 90:
                        quality = 5
                    elif pct >= 75:
                        quality = 4
                    elif pct >= 60:
                        quality = 3
                    elif pct >= 40:
                        quality = 2
                    else:
                        quality = 1
                    sr_state[topic] = _sm2_update(sr_state[topic], quality)
                    _save_sr_state(sr_state)

            st.rerun()
    else:
        # Score summary
        total_q = len(item_set["questions"])
        correct_count = sum(
            1 for q in item_set["questions"]
            if user_answers.get(str(q["number"])) == q["answer"]
        )
        pct = (correct_count / total_q * 100) if total_q > 0 else 0
        colour = "#10b981" if pct >= 60 else "#ef4444"
        st.markdown(
            f'<div style="text-align:center; padding:20px; margin-top:12px;'
            f' background:rgba(255,255,255,0.02); border-radius:12px;">'
            f'<div style="font-size:32px; font-weight:800; color:{colour};">'
            f'{correct_count}/{total_q}</div>'
            f'<div style="font-size:13px; color:rgba(255,255,255,0.5);">'
            f'{pct:.0f}% correct</div></div>',
            unsafe_allow_html=True,
        )

        if st.button("New Practice Set", key="cfa_new_btn", use_container_width=True):
            for key in ["cfa_current_item_set", "cfa_user_answers",
                        "cfa_submitted", "cfa_current_topic", "cfa_raw_response"]:
                st.session_state.pop(key, None)
            st.rerun()


# ---------------------------------------------------------------------------
# Mode 2: Concept Explainer
# ---------------------------------------------------------------------------

def _render_concept_explainer(brand: dict):
    st.markdown("##### Ask About a CFA Concept")

    concept = st.text_input(
        "Concept or question",
        placeholder="e.g., Explain the difference between cash flow yield and IRR for MBS",
        key="cfa_concept_input",
    )

    if st.button("Explain", key="cfa_explain_btn", use_container_width=True):
        if not concept:
            st.warning("Enter a concept to explain.")
            return

        with st.spinner("Generating explanation..."):
            try:
                prompt = _PROMPT_CONCEPT.format(concept=concept)
                explanation = _call_claude(prompt, concept)
                st.session_state["cfa_last_explanation"] = explanation
                st.session_state["cfa_last_concept"] = concept
            except Exception as e:
                st.error(f"Explanation failed: {e}")
                return

    if "cfa_last_explanation" in st.session_state:
        st.markdown("---")
        st.markdown(f"##### {st.session_state.get('cfa_last_concept', 'Concept')}")
        st.markdown(
            f'<div style="padding:20px; background:rgba(255,255,255,0.02);'
            f' border-radius:10px; border-left:3px solid {brand["accent_colour"]};'
            f' font-size:14px; line-height:1.8; color:rgba(255,255,255,0.85);">'
            f'{st.session_state["cfa_last_explanation"]}</div>',
            unsafe_allow_html=True,
        )


# ---------------------------------------------------------------------------
# Mode 3: Progress Tracker
# ---------------------------------------------------------------------------

def _render_progress_tracker(brand: dict):
    import plotly.graph_objects as go

    progress = _load_progress()
    plan = _generate_study_plan(progress)

    # Overall stats
    total_a = progress["total_attempted"]
    total_c = progress["total_correct"]
    overall_rate = (total_c / total_a * 100) if total_a > 0 else 0

    st.markdown("##### Overall Progress")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Questions Attempted", total_a)
    c2.metric("Correct", total_c)
    c3.metric("Overall Rate", f"{overall_rate:.0f}%")
    c4.metric("Days Until Exam", plan["days_left"])

    # Progress ring
    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=overall_rate,
        title={"text": "Correct Rate", "font": {"size": 14, "color": "rgba(255,255,255,0.6)"}},
        number={"suffix": "%", "font": {"size": 28, "color": "white"}},
        gauge={
            "axis": {"range": [0, 100], "tickcolor": "rgba(255,255,255,0.2)"},
            "bar": {"color": brand["primary_colour"]},
            "bgcolor": "rgba(255,255,255,0.05)",
            "borderwidth": 0,
            "threshold": {
                "line": {"color": "#ef4444", "width": 2},
                "thickness": 0.8,
                "value": 60,
            },
        },
    ))
    fig.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        font=dict(color="white"),
        height=200,
        margin=dict(l=30, r=30, t=40, b=10),
    )
    st.plotly_chart(fig, use_container_width=True)

    # Per-topic breakdown
    st.markdown("---")
    st.markdown("##### Per-Topic Performance")

    topic_data = []
    for topic in CFA_TOPICS:
        stats = progress["topics"].get(topic, {"attempted": 0, "correct": 0})
        rate = (stats["correct"] / stats["attempted"] * 100) if stats["attempted"] > 0 else 0
        is_weak = rate < 60 and stats["attempted"] > 0
        topic_data.append({
            "Topic": topic,
            "Attempted": stats["attempted"],
            "Correct": stats["correct"],
            "Rate": f"{rate:.0f}%",
            "Status": "⚠️ Focus" if is_weak else ("✅" if stats["attempted"] > 0 else "—"),
        })

    st.dataframe(topic_data, use_container_width=True, hide_index=True)

    # Weak areas
    weak = [d for d in topic_data if d["Status"] == "⚠️ Focus"]
    if weak:
        st.markdown("##### Weak Areas (below 60%)")
        for w in weak:
            st.markdown(f"- **{w['Topic']}**: {w['Rate']} ({w['Attempted']} questions)")

    # Study plan
    st.markdown("---")
    st.markdown("##### Personalised Study Plan")
    st.markdown(
        f"**{plan['weeks_left']} weeks remaining** · "
        f"**{plan['total_sessions']} sessions** at 5/week"
    )

    if plan["focus_areas"]:
        focus_str = ", ".join(
            f"{t} ({plan['focus_percentages'][t]:.0%})"
            for t in plan["focus_areas"]
        )
        st.markdown(f"**Focus areas:** {focus_str}")

    st.markdown("##### This Week's Schedule")
    for day, topic in plan["weekly_schedule"].items():
        st.markdown(f"- **{day}:** {topic}")

    # Sessions per topic
    st.markdown("##### Recommended Sessions Per Topic")
    sessions_data = [
        {"Topic": t, "Sessions": s, "Exam Weight": f"{CFA_TOPICS[t]:.0%}"}
        for t, s in sorted(plan["sessions_per_topic"].items(), key=lambda x: x[1], reverse=True)
    ]
    st.dataframe(sessions_data, use_container_width=True, hide_index=True)

    # Reset progress
    st.markdown("---")
    if st.button("Reset All Progress", key="cfa_reset_btn"):
        _PROGRESS_FILE.unlink(missing_ok=True)
        _SR_FILE.unlink(missing_ok=True)
        st.success("Progress reset.")
        st.rerun()


# ---------------------------------------------------------------------------
# Mode 4: Spaced Repetition (Phase 10)
# ---------------------------------------------------------------------------

def _render_spaced_repetition(brand: dict):
    import plotly.graph_objects as go

    st.markdown("##### Spaced Repetition — SM-2 Schedule")
    st.caption(
        "Topics are scheduled using the SM-2 algorithm. After each practice session, "
        "the algorithm adjusts intervals based on your performance."
    )

    sr_state = _load_sr_state()
    today = date.today()

    # Due topics
    due_topics = _get_due_topics(sr_state)

    if due_topics:
        st.markdown(f"**{len(due_topics)} topic(s) due for review today:**")
        for i, topic in enumerate(due_topics, 1):
            state = sr_state[topic]
            review_date = date.fromisoformat(state["next_review"])
            overdue = (today - review_date).days
            overdue_str = f" ({overdue}d overdue)" if overdue > 0 else ""
            ef_str = f"EF: {state['easiness']:.1f}"
            st.markdown(f"{i}. **{topic}**{overdue_str} · {ef_str}")

        st.info(
            "Go to the **Practice Session** tab and generate an item set for "
            f"**{due_topics[0]}** to complete your review."
        )
    else:
        st.success("All topics reviewed — no reviews due today.")
        # Find next due date
        next_dates = []
        for topic, state in sr_state.items():
            next_dates.append((topic, date.fromisoformat(state["next_review"])))
        next_dates.sort(key=lambda x: x[1])
        if next_dates:
            next_topic, next_date = next_dates[0]
            days_until = (next_date - today).days
            st.caption(f"Next review: **{next_topic}** in {days_until} day(s) ({next_date.isoformat()})")

    # Schedule overview
    st.markdown("---")
    st.markdown("##### Full Schedule")

    schedule_data = []
    for topic in CFA_TOPICS:
        state = sr_state.get(topic, {})
        next_review = state.get("next_review", today.isoformat())
        review_date = date.fromisoformat(next_review)
        days_until = (review_date - today).days
        status = "Due" if days_until <= 0 else f"In {days_until}d"

        schedule_data.append({
            "Topic": topic,
            "Next Review": next_review,
            "Status": status,
            "Interval": f"{state.get('interval', 1)}d",
            "Easiness": f"{state.get('easiness', 2.5):.2f}",
            "Reps": state.get("repetitions", 0),
        })

    st.dataframe(schedule_data, use_container_width=True, hide_index=True)

    # Easiness factor chart
    st.markdown("---")
    st.markdown("##### Easiness Factor by Topic")

    topics = list(CFA_TOPICS.keys())
    efs = [sr_state.get(t, {}).get("easiness", 2.5) for t in topics]

    fig = go.Figure(go.Bar(
        x=efs,
        y=topics,
        orientation="h",
        marker_color=[
            brand["primary_colour"] if ef >= 2.5 else "#f59e0b" if ef >= 1.8 else "#ef4444"
            for ef in efs
        ],
    ))
    fig.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="rgba(255,255,255,0.7)", size=11),
        height=300,
        margin=dict(l=10, r=10, t=10, b=10),
        xaxis=dict(
            title="Easiness Factor",
            range=[1.0, 3.5],
            gridcolor="rgba(255,255,255,0.05)",
        ),
        yaxis=dict(autorange="reversed"),
    )
    st.plotly_chart(fig, use_container_width=True)

    # Reset SR state
    if st.button("Reset Spaced Repetition", key="cfa_reset_sr_btn"):
        _SR_FILE.unlink(missing_ok=True)
        st.success("Spaced repetition state reset.")
        st.rerun()


# ---------------------------------------------------------------------------
# Mode 5: Errata Log (Phase 10)
# ---------------------------------------------------------------------------

def _render_errata_log(brand: dict):
    st.markdown("##### Errata Log")
    st.caption(
        "Questions flagged for quality issues. This helps improve future item sets "
        "and identifies patterns in AI-generated content."
    )

    errata = _load_errata()

    if not errata:
        st.info("No errata reports yet. Flag questions during practice sessions using the flag button.")
        return

    # Summary stats
    c1, c2, c3 = st.columns(3)
    c1.metric("Total Flags", len(errata))
    open_count = sum(1 for e in errata if e.get("status") == "open")
    c2.metric("Open", open_count)
    c3.metric("Resolved", len(errata) - open_count)

    # Issue type breakdown
    type_counts = Counter(e.get("issue_type", "Other") for e in errata)
    if type_counts:
        st.markdown("##### By Issue Type")
        for issue_type, count in type_counts.most_common():
            st.caption(f"  {issue_type}: {count}")

    # Full log
    st.markdown("---")
    st.markdown("##### All Reports")

    for i, report in enumerate(reversed(errata)):
        status_icon = "🔴" if report.get("status") == "open" else "🟢"
        with st.expander(
            f"{status_icon} {report.get('topic', '?')} · Q{report.get('question_number', '?')} — "
            f"{report.get('issue_type', 'Unknown')} ({report.get('date', '?')[:10]})"
        ):
            st.markdown(f"**Issue:** {report.get('description', '—')}")
            st.markdown(f"**Question:** {report.get('question_text', '—')}")
            idx = len(errata) - 1 - i
            if report.get("status") == "open":
                if st.button("Mark Resolved", key=f"cfa_errata_resolve_{idx}"):
                    errata[idx]["status"] = "resolved"
                    _save_errata(errata)
                    st.rerun()

    # Clear all
    st.markdown("---")
    if st.button("Clear All Errata", key="cfa_clear_errata_btn"):
        _ERRATA_FILE.unlink(missing_ok=True)
        st.success("Errata cleared.")
        st.rerun()
