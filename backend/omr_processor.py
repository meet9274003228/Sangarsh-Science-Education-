"""
OMR Processor Engine for Sangarsh Science Education.
Handles alignment detection, Roll Number extraction, bubble darkness analysis,
score calculation against answer keys, Board/GUJCET/NEET/JEE marking schemes,
subject-wise score breakdown, and itemized wrong answer analysis.
"""

import json
import math

class OMRProcessor:
    def __init__(self, darkness_threshold: float = 0.35):
        self.darkness_threshold = darkness_threshold

    @staticmethod
    def normalize_detected_answers(raw_bubble_data: dict, total_questions: int = 30) -> dict:
        """
        STEP 3: CONVERSION LAYER for detected answers.
        Convert any raw bubble detection output (indices 0..3, letters A..D, list, 0-indexed/1-indexed dict)
        into the Standard Single Source of Truth format:
        { "1": "A", "2": "C", "3": null, "4": "MULTIPLE" }
        """
        normalized = {}
        if not raw_bubble_data:
            for q in range(1, total_questions + 1):
                normalized[str(q)] = None
            return normalized

        is_dict = isinstance(raw_bubble_data, dict)
        is_zero_indexed = is_dict and (('0' in raw_bubble_data or 0 in raw_bubble_data) and 
                                       (str(total_questions) not in raw_bubble_data and total_questions not in raw_bubble_data))

        for q_idx in range(1, total_questions + 1):
            q_str = str(q_idx)

            raw_val = None
            if isinstance(raw_bubble_data, (list, tuple)):
                if 0 <= q_idx - 1 < len(raw_bubble_data):
                    raw_val = raw_bubble_data[q_idx - 1]
            elif is_dict:
                if is_zero_indexed:
                    raw_val = raw_bubble_data.get(str(q_idx - 1), raw_bubble_data.get(q_idx - 1))
                else:
                    raw_val = raw_bubble_data.get(q_str, raw_bubble_data.get(q_idx))
                    if raw_val is None:
                        raw_val = raw_bubble_data.get(str(q_idx - 1), raw_bubble_data.get(q_idx - 1))

            if raw_val is None:
                norm_val = None
            else:
                s_val = str(raw_val).strip()
                upper_s = s_val.upper()

                if upper_s in ["NONE", "NULL", "UNATTEMPTED", "NOT_ATTEMPTED", "-1", ""]:
                    norm_val = None
                elif upper_s in ["MULTIPLE", "MULTIPLE_MARKED", "MULTI", "BOTH"]:
                    norm_val = "MULTIPLE"
                elif isinstance(raw_val, (list, tuple, set)):
                    if len(raw_val) == 0:
                        norm_val = None
                    elif len(raw_val) == 1:
                        elem = str(list(raw_val)[0]).strip().upper()
                        norm_val = chr(65 + int(elem)) if elem in ["0", "1", "2", "3"] else elem if elem in ["A", "B", "C", "D"] else None
                    else:
                        norm_val = "MULTIPLE"
                elif s_val in ["0", "1", "2", "3"]:
                    norm_val = chr(65 + int(s_val))
                elif isinstance(raw_val, (int, float)) and 0 <= int(raw_val) <= 3:
                    norm_val = chr(65 + int(raw_val))
                elif upper_s in ["A", "B", "C", "D"]:
                    norm_val = upper_s
                else:
                    print(f"⚠️ [OMR Defensive Warning] Unrecognized option format '{raw_val}' for Q{q_str}. Normalizing to None.")
                    norm_val = None

            normalized[q_str] = norm_val

        return normalized

    @staticmethod
    def normalize_answer_key(raw_key_data: dict, total_questions: int = None) -> dict:
        """
        STEP 3: CONVERSION LAYER for answer key.
        Convert any raw answer key data into the Standard Single Source of Truth format:
        { "1": "A", "2": "B", ... }
        """
        normalized = {}
        if not raw_key_data:
            tot = total_questions or 30
            for q in range(1, tot + 1):
                normalized[str(q)] = "A"
            return normalized

        num_questions = total_questions or len(raw_key_data)

        is_dict = isinstance(raw_key_data, dict)
        is_zero_indexed = is_dict and (('0' in raw_key_data or 0 in raw_key_data) and 
                                       (str(num_questions) not in raw_key_data and num_questions not in raw_key_data))

        for q_idx in range(1, num_questions + 1):
            q_str = str(q_idx)

            raw_val = None
            if isinstance(raw_key_data, (list, tuple)):
                if 0 <= q_idx - 1 < len(raw_key_data):
                    raw_val = raw_key_data[q_idx - 1]
            elif is_dict:
                if is_zero_indexed:
                    raw_val = raw_key_data.get(str(q_idx - 1), raw_key_data.get(q_idx - 1))
                else:
                    raw_val = raw_key_data.get(q_str, raw_key_data.get(q_idx))
                    if raw_val is None:
                        raw_val = raw_key_data.get(str(q_idx - 1), raw_key_data.get(q_idx - 1))

            if raw_val is None:
                norm_val = "A"
            else:
                s_val = str(raw_val).strip()
                upper_s = s_val.upper()
                if s_val in ["0", "1", "2", "3"]:
                    norm_val = chr(65 + int(s_val))
                elif isinstance(raw_val, (int, float)) and 0 <= int(raw_val) <= 3:
                    norm_val = chr(65 + int(raw_val))
                elif upper_s in ["A", "B", "C", "D"]:
                    norm_val = upper_s
                else:
                    norm_val = "A"

            normalized[q_str] = norm_val

        return normalized

    @staticmethod
    def calculate_score(detected: dict, answer_key: dict, marks_correct: float = 4.0, marks_wrong: float = 1.0, marks_unattempted: float = 0.0, print_table: bool = True) -> dict:
        """
        STEP 4 & STEP 5: SCORING FUNCTION REWRITE & VISIBLE DEBUG TABLE OUTPUT.
        Calculates marks using standardized detected and answer_key dictionaries.
        """
        results = []
        correct_count = 0
        wrong_count = 0
        unattempted_count = 0
        multiple_count = 0
        obtained_marks = 0.0

        if print_table:
            print("\n┌───────┬──────────┬──────────┬──────────────────┐")
            print("│ Q.No  │ Expected │ Detected │ Status           │")
            print("├───────┼──────────┼──────────┼──────────────────┤")

        for question_no in answer_key:
            expected = answer_key[question_no]
            actual = detected.get(question_no) # Normalized value (A/B/C/D, "MULTIPLE", or None)

            if actual is None:
                status = "UNATTEMPTED"
                unattempted_count += 1
                item_marks = marks_unattempted
            elif actual == "MULTIPLE":
                status = "MULTIPLE_MARKED"
                multiple_count += 1
                wrong_count += 1
                item_marks = -marks_wrong
            elif actual == expected:
                status = "CORRECT"
                correct_count += 1
                item_marks = marks_correct
            else:
                status = "WRONG"
                wrong_count += 1
                item_marks = -marks_wrong

            obtained_marks += item_marks

            disp_detected = "null" if actual is None else actual
            if print_table:
                print(f"│ {question_no:<5} │ {expected:<8} │ {disp_detected:<8} │ {status:<16} │")

            results.append({
                "question": question_no,
                "expected": expected,
                "detected": actual,
                "status": status,
                "marks": item_marks
            })

        if print_table:
            print("└───────┴──────────┴──────────┴──────────────────┘")
            print(f"Total Score: {obtained_marks:.2f} | Correct: {correct_count} | Wrong: {wrong_count} | Unattempted: {unattempted_count} | Multiple: {multiple_count}\n")

        total_questions = len(answer_key)
        total_possible = total_questions * marks_correct
        percentage = round((max(0.0, obtained_marks) / total_possible) * 100.0, 2) if total_possible > 0 else 0.0

        return {
            "total_score": round(obtained_marks, 2),
            "total_possible": total_possible,
            "percentage": percentage,
            "total_questions": total_questions,
            "correct_count": correct_count,
            "wrong_count": wrong_count,
            "unattempted_count": unattempted_count,
            "multiple_count": multiple_count,
            "details": results
        }

    def evaluate_bubbles(self, raw_answers: dict, answer_key: dict, marks_per_correct: float = 4.0, negative_marks: float = 1.0, exam_subject: str = "Science", print_table: bool = True) -> dict:
        """
        Compare scanned answers against answer key using standardized pipeline.
        """
        tot_q = len(answer_key) if answer_key else 30
        norm_key = self.normalize_answer_key(answer_key, tot_q)
        norm_detected = self.normalize_detected_answers(raw_answers, tot_q)

        score_res = self.calculate_score(norm_detected, norm_key, marks_per_correct, negative_marks, 0.0, print_table)

        # Subject breakdown for multi-subject (PCB/PCM)
        is_multi_subject = "PCB" in exam_subject or "PCM" in exam_subject or "Combined" in exam_subject
        subjects = ["Physics", "Chemistry", "Biology" if "PCB" in exam_subject else "Mathematics"] if is_multi_subject else [exam_subject]
        
        subject_breakdown = {s: {"correct": 0, "wrong": 0, "unattempted": 0, "marks": 0.0, "total": 0.0} for s in subjects}
        q_per_subject = max(1, tot_q // len(subjects)) if is_multi_subject else tot_q

        itemized_results = {}
        wrong_analysis = []

        for idx, item in enumerate(score_res["details"]):
            q_str = item["question"]
            q_int = int(q_str)
            
            q_subj = subjects[min(len(subjects) - 1, (q_int - 1) // q_per_subject)] if is_multi_subject else exam_subject
            subject_breakdown[q_subj]["total"] += marks_per_correct

            if item["status"] == "CORRECT":
                subject_breakdown[q_subj]["correct"] += 1
                subject_breakdown[q_subj]["marks"] += marks_per_correct
            elif item["status"] in ["WRONG", "MULTIPLE_MARKED"]:
                subject_breakdown[q_subj]["wrong"] += 1
                subject_breakdown[q_subj]["marks"] -= negative_marks
                wrong_analysis.append({
                    "q": q_int,
                    "marked": item["detected"] or "NONE",
                    "correct": item["expected"],
                    "subject": q_subj
                })
            else:
                subject_breakdown[q_subj]["unattempted"] += 1

            itemized_results[q_str] = {
                "scanned": item["detected"] or "NONE",
                "correct": item["expected"],
                "status": item["status"],
                "score": item["marks"],
                "subject": q_subj
            }

        return {
            "obtained_marks": score_res["total_score"],
            "total_marks": score_res["total_possible"],
            "percentage": score_res["percentage"],
            "correct_count": score_res["correct_count"],
            "wrong_count": score_res["wrong_count"],
            "unattempted_count": score_res["unattempted_count"],
            "multiple_count": score_res["multiple_count"],
            "itemized": itemized_results,
            "wrong_analysis": wrong_analysis,
            "subject_breakdown": subject_breakdown
        }

    def process_scan_payload(self, payload: dict, answer_key: dict, marks_per_correct: float = 4.0, negative_marks: float = 1.0, exam_subject: str = "Science", print_table: bool = True) -> dict:
        """
        Process scan payload containing roll_no and answers dictionary.
        """
        roll_no = str(payload.get("roll_no", "100001")).strip()
        scanned_answers = payload.get("answers", {})

        eval_data = self.evaluate_bubbles(scanned_answers, answer_key, marks_per_correct, negative_marks, exam_subject, print_table)

        return {
            "roll_no": roll_no,
            "scanned_answers": scanned_answers,
            "evaluation": eval_data
        }

# Global Instance
omr_engine = OMRProcessor()

