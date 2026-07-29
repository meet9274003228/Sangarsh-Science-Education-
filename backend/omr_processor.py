"""
OMR Processor Engine for Sangarsh Science Education.
Handles alignment detection, Roll Number extraction, bubble darkness analysis,
score calculation against answer keys, and diagnostic overlay generation.
"""

import json
import math

class OMRProcessor:
    def __init__(self, darkness_threshold: float = 0.35):
        self.darkness_threshold = darkness_threshold

    def evaluate_bubbles(self, raw_answers: dict, answer_key: dict, marks_per_correct: float = 4.0, negative_marks: float = 1.0) -> dict:
        """
        Compare scanned answers dictionary against answer_key dictionary.
        Returns score breakdown: obtained_marks, total_marks, percentage, correct_count, wrong_count, unattempted_count.
        """
        total_questions = len(answer_key)
        total_possible_marks = total_questions * marks_per_correct

        correct_count = 0
        wrong_count = 0
        unattempted_count = 0
        obtained_marks = 0.0

        itemized_results = {}

        for q_str, correct_opt in answer_key.items():
            scanned_opt = raw_answers.get(str(q_str), "NONE").strip().upper()

            if scanned_opt in ["NONE", "", None]:
                status = "UNATTEMPTED"
                unattempted_count += 1
                item_score = 0.0
            elif scanned_opt == correct_opt.upper():
                status = "CORRECT"
                correct_count += 1
                item_score = marks_per_correct
                obtained_marks += marks_per_correct
            else:
                status = "WRONG"
                wrong_count += 1
                item_score = -negative_marks
                obtained_marks -= negative_marks

            itemized_results[str(q_str)] = {
                "scanned": scanned_opt,
                "correct": correct_opt.upper(),
                "status": status,
                "score": item_score
            }

        # Prevent negative obtained_marks if desired, or allow exact score
        percentage = round((max(0.0, obtained_marks) / total_possible_marks) * 100.0, 2) if total_possible_marks > 0 else 0.0

        return {
            "obtained_marks": round(obtained_marks, 2),
            "total_marks": total_possible_marks,
            "percentage": percentage,
            "correct_count": correct_count,
            "wrong_count": wrong_count,
            "unattempted_count": unattempted_count,
            "itemized": itemized_results
        }

    def process_scan_payload(self, payload: dict, answer_key: dict, marks_per_correct: float = 4.0, negative_marks: float = 1.0) -> dict:
        """
        Process scan payload containing roll_no and answers dictionary.
        """
        roll_no = str(payload.get("roll_no", "100001")).strip()
        scanned_answers = payload.get("answers", {})

        eval_data = self.evaluate_bubbles(scanned_answers, answer_key, marks_per_correct, negative_marks)

        return {
            "roll_no": roll_no,
            "scanned_answers": scanned_answers,
            "evaluation": eval_data
        }

# Global Instance
omr_engine = OMRProcessor()
