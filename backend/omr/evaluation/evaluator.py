import json
from typing import Dict, List, Tuple, Any, Union

def parse_options_string(options_str: Union[str, List[str]]) -> List[str]:
    """
    Parses a correct answer string or list into a list of uppercase option letters.
    E.g. "A,B" -> ["A", "B"], "C" -> ["C"], ["A", "B"] -> ["A", "B"]
    """
    if not options_str:
        return []
        
    if isinstance(options_str, list):
        return [str(opt).strip().upper() for opt in options_str if str(opt).strip()]
        
    if isinstance(options_str, str):
        # Handle formats like "A,B", "A|B", "A/B"
        normalized = options_str.replace("|", ",").replace("/", ",")
        return [opt.strip().upper() for opt in normalized.split(",") if opt.strip()]
        
    return [str(options_str).strip().upper()]

def evaluate_single_question(
    detected_option: str,      # Option selected by bubble detector ("A", "B", "", "MULTIPLE", etc.)
    detected_status: str,      # Bubble detection status ("SINGLE_MARKED", "BLANK", "MULTIPLE_MARKED", "UNCERTAIN")
    correct_option_raw: Any,   # Correct answer from key (str, list, etc.)
    marks_per_correct: float = 4.0,
    negative_marks: float = 1.0,
    blank_marks: float = 0.0
) -> Tuple[str, float]:
    """
    Evaluates a single question's response against the correct answer key.
    
    Returns:
        Tuple of (status, marks)
        - status: "CORRECT", "WRONG", "BLANK", "MULTIPLE_MARKED", "UNCERTAIN"
        - marks: calculated score for this question
    """
    correct_options = parse_options_string(correct_option_raw)
    
    # 1. Handle no correct answer set (e.g. question dropped or validation key skipped)
    if not correct_options:
        # Treat as correct/ignored or neutral score
        return "CORRECT", marks_per_correct
        
    # Standardize values
    det_opt = (detected_option or "").strip().upper()
    det_status = (detected_status or "BLANK").strip().upper()
    
    # 2. Blank response
    if det_status == "BLANK" or not det_opt:
        return "BLANK", blank_marks

    # 3. Uncertain response (flagged for review)
    # Give blank marks and flag as UNCERTAIN so teacher can resolve without false penalty
    if det_status == "UNCERTAIN":
        return "UNCERTAIN", blank_marks

    # 4. Multiple marked selection
    # If the student marked multiple options, and the template/exam only allows single selection:
    if det_status == "MULTIPLE_MARKED" or det_opt == "MULTIPLE":
        # Check if the question answer key has multiple options AND allows matching them.
        # But for standard single-choice, multiple bubbles filled is WRONG (MULTIPLE_MARKED).
        # We penalize with negative_marks.
        return "MULTIPLE_MARKED", -negative_marks

    # 5. Single marked comparison
    # If correct answer contains multiple options (e.g. A or B is correct):
    # Student matches if their single selection is one of the correct options.
    if det_opt in correct_options:
        return "CORRECT", marks_per_correct
    else:
        return "WRONG", -negative_marks

def evaluate_scanned_sheet(
    detected_answers: Dict[str, Dict[str, Any]], # {"1": {"selected_option": "A", "status": "SINGLE_MARKED"}, ...}
    answer_key: Dict[str, Any],                  # {"1": "A", "2": ["B", "C"], ...}
    marking_scheme: Dict[str, float]             # {"marks_per_correct": 4.0, "negative_marks": 1.0, "blank_marks": 0.0}
) -> Dict[str, Any]:
    """
    Evaluates a full scanned sheet of answers against the answer key.
    
    Calculates summary totals:
    - total_questions
    - attempted
    - correct
    - wrong
    - blank
    - multiple_marked
    - uncertain
    - positive_marks
    - negative_marks
    - final_score
    - percentage
    """
    marks_per_correct = float(marking_scheme.get("marks_per_correct", 4.0))
    negative_marks = float(marking_scheme.get("negative_marks", 1.0))
    blank_marks = float(marking_scheme.get("blank_marks", 0.0))
    
    total_questions = len(answer_key) if answer_key else len(detected_answers)
    if total_questions == 0:
        total_questions = 30 # standard default
        
    correct_count = 0
    wrong_count = 0
    blank_count = 0
    multiple_marked_count = 0
    uncertain_count = 0
    
    positive_marks = 0.0
    num_negatives = 0.0
    obtained_marks = 0.0
    
    itemized_results = []
    
    # Iterate through all questions in answer_key or detected answers
    all_q_numbers = sorted(list(set(
        [int(k) for k in answer_key.keys() if k.isdigit()] + 
        [int(k) for k in detected_answers.keys() if k.isdigit()]
    )))
    
    # If list is empty, default loop
    if not all_q_numbers:
        all_q_numbers = list(range(1, total_questions + 1))
        
    for q_num in all_q_numbers:
        q_key = str(q_num)
        
        correct_ans = answer_key.get(q_key, [])
        det_data = detected_answers.get(q_key, {"selected_option": "", "status": "BLANK"})
        
        detected_opt = det_data.get("selected_option", "")
        detected_status = det_data.get("status", "BLANK")
        
        status, question_score = evaluate_single_question(
            detected_option=detected_opt,
            detected_status=detected_status,
            correct_option_raw=correct_ans,
            marks_per_correct=marks_per_correct,
            negative_marks=negative_marks,
            blank_marks=blank_marks
        )
        
        # Accumulate counters
        if status == "CORRECT":
            correct_count += 1
            positive_marks += question_score
        elif status == "WRONG":
            wrong_count += 1
            num_negatives += abs(question_score)
        elif status == "BLANK":
            blank_count += 1
        elif status == "MULTIPLE_MARKED":
            multiple_marked_count += 1
            num_negatives += abs(question_score)
        elif status == "UNCERTAIN":
            uncertain_count += 1
            
        obtained_marks += question_score
        
        itemized_results.append({
            "question_no": q_num,
            "selected_option": detected_opt,
            "correct_option": correct_ans if isinstance(correct_ans, list) else [correct_ans] if correct_ans else [],
            "status": status,
            "marks": question_score
        })
        
    attempted = correct_count + wrong_count + multiple_marked_count
    
    # Estimate total possible marks (assuming all questions answered correctly)
    total_possible_marks = total_questions * marks_per_correct
    percentage = (obtained_marks / total_possible_marks * 100.0) if total_possible_marks > 0 else 0.0
    percentage = round(max(0.0, percentage), 2)
    
    return {
        "summary": {
            "total_questions": len(all_q_numbers),
            "attempted": attempted,
            "correct": correct_count,
            "wrong": wrong_count,
            "blank": blank_count,
            "multiple_marked": multiple_marked_count,
            "uncertain": uncertain_count,
            "positive_marks": round(positive_marks, 2),
            "negative_marks": round(num_negatives, 2),
            "final_score": round(obtained_marks, 2),
            "percentage": percentage
        },
        "itemized": itemized_results
    }
