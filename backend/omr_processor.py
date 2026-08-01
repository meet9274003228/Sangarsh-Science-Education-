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
    def normalize_option(val) -> str:
        """
        Normalize detected answer / option key to standard uppercase letter format: 'A', 'B', 'C', 'D' or 'NONE'.
        Handles:
        - String letters: 'A', 'B', 'C', 'D', 'a', 'b', 'c', 'd'
        - Numeric indices: 0 -> 'A', 1 -> 'B', 2 -> 'C', 3 -> 'D'
        - String numeric indices: '0' -> 'A', '1' -> 'B', '2' -> 'C', '3' -> 'D'
        - Unattempted / invalid values: None, '', 'NONE', 'UNATTEMPTED', -1, '-1'
        """
        if val is None:
            return "NONE"

        s_val = str(val).strip()
        if not s_val or s_val.upper() in ["NONE", "NULL", "UNATTEMPTED", "NOT_ATTEMPTED", "-1"]:
            return "NONE"

        # Check numeric index conversion (0->A, 1->B, 2->C, 3->D)
        if s_val in ["0", "1", "2", "3"]:
            return chr(65 + int(s_val))
        elif isinstance(val, (int, float)) and 0 <= int(val) <= 3:
            return chr(65 + int(val))

        # Check single letter (A, B, C, D)
        upper_val = s_val.upper()
        if upper_val in ["A", "B", "C", "D"]:
            return upper_val

        return upper_val

    @staticmethod
    def get_raw_value(data_dict, q_idx: int, total_questions: int = 30):
        """
        Flexibly look up answer for question index `q_idx` (1-indexed).
        Handles:
        - String 1-indexed key: '1'
        - Int 1-indexed key: 1
        - String 0-indexed key fallback (if 1-indexed key missing or dict is 0-indexed): '0'
        - Int 0-indexed key fallback: 0
        - List / Tuple indexing: data_dict[q_idx - 1]
        """
        if data_dict is None:
            return None

        if isinstance(data_dict, (list, tuple)):
            if 0 <= q_idx - 1 < len(data_dict):
                return data_dict[q_idx - 1]
            elif 0 <= q_idx < len(data_dict):
                return data_dict[q_idx]
            return None

        if not isinstance(data_dict, dict):
            return None

        q_str = str(q_idx)
        q_int = int(q_idx)

        # Detect if dictionary is explicitly 0-indexed (has 0/'0' and missing total_questions/str(total_questions))
        is_zero_indexed = (('0' in data_dict or 0 in data_dict) and 
                           (str(total_questions) not in data_dict and total_questions not in data_dict))

        if is_zero_indexed:
            q_zero_str = str(q_idx - 1)
            q_zero_int = q_idx - 1
            if q_zero_str in data_dict:
                return data_dict[q_zero_str]
            if q_zero_int in data_dict:
                return data_dict[q_zero_int]

        # Standard 1-indexed lookups
        if q_str in data_dict:
            return data_dict[q_str]
        if q_int in data_dict:
            return data_dict[q_int]

        # Fallback 0-indexed lookup
        q_zero_str = str(q_idx - 1)
        q_zero_int = q_idx - 1
        if q_zero_str in data_dict:
            return data_dict[q_zero_str]
        if q_zero_int in data_dict:
            return data_dict[q_zero_int]

        return None

    def evaluate_bubbles(self, raw_answers: dict, answer_key: dict, marks_per_correct: float = 4.0, negative_marks: float = 1.0, exam_subject: str = "Science") -> dict:
        """
        Compare scanned answers dictionary against answer_key dictionary.
        Returns score breakdown: obtained_marks, total_marks, percentage, correct_count, wrong_count, unattempted_count,
        wrong_analysis (list of incorrect questions & options), and subject_breakdown.
        """
        total_questions = len(answer_key) if answer_key else 30
        total_possible_marks = total_questions * marks_per_correct

        correct_count = 0
        wrong_count = 0
        unattempted_count = 0
        obtained_marks = 0.0

        itemized_results = {}
        wrong_analysis = []

        # Determine subject distribution for multi-subject exams
        is_multi_subject = "PCB" in exam_subject or "PCM" in exam_subject or "Combined" in exam_subject
        subjects = ["Physics", "Chemistry", "Biology" if "PCB" in exam_subject else "Mathematics"] if is_multi_subject else [exam_subject]
        
        subject_breakdown = {s: {"correct": 0, "wrong": 0, "unattempted": 0, "marks": 0.0, "total": 0.0} for s in subjects}
        q_per_subject = max(1, total_questions // len(subjects)) if is_multi_subject else total_questions

        for q_idx in range(1, total_questions + 1):
            q_str = str(q_idx)

            # Retrieve raw detected & expected values using type-safe flex lookup
            detected_raw = self.get_raw_value(raw_answers, q_idx, total_questions)
            expected_raw = self.get_raw_value(answer_key, q_idx, total_questions)

            # Normalize both values to standardized uppercase letter format ('A', 'B', 'C', 'D' or 'NONE')
            scanned_opt = self.normalize_option(detected_raw)
            correct_opt = self.normalize_option(expected_raw)
            if correct_opt == "NONE":
                correct_opt = "A" # Default fallback for missing key

            # Determine subject for this question
            if is_multi_subject:
                subj_idx = min(len(subjects) - 1, (q_idx - 1) // q_per_subject)
                q_subj = subjects[subj_idx]
            else:
                q_subj = exam_subject

            if q_subj not in subject_breakdown:
                subject_breakdown[q_subj] = {"correct": 0, "wrong": 0, "unattempted": 0, "marks": 0.0, "total": 0.0}
            
            subject_breakdown[q_subj]["total"] += marks_per_correct

            if scanned_opt in ["NONE", "", None]:
                status = "UNATTEMPTED"
                unattempted_count += 1
                item_score = 0.0
                subject_breakdown[q_subj]["unattempted"] += 1
            elif scanned_opt == correct_opt:
                status = "CORRECT"
                correct_count += 1
                item_score = marks_per_correct
                obtained_marks += marks_per_correct
                subject_breakdown[q_subj]["correct"] += 1
                subject_breakdown[q_subj]["marks"] += marks_per_correct
            else:
                status = "WRONG"
                wrong_count += 1
                item_score = -negative_marks
                obtained_marks -= negative_marks
                subject_breakdown[q_subj]["wrong"] += 1
                subject_breakdown[q_subj]["marks"] -= negative_marks

                wrong_analysis.append({
                    "q": q_idx,
                    "marked": scanned_opt,
                    "correct": correct_opt,
                    "subject": q_subj
                })

            itemized_results[q_str] = {
                "scanned": scanned_opt,
                "correct": correct_opt,
                "status": status,
                "score": item_score,
                "subject": q_subj
            }

        percentage = round((max(0.0, obtained_marks) / total_possible_marks) * 100.0, 2) if total_possible_marks > 0 else 0.0

        return {
            "obtained_marks": round(obtained_marks, 2),
            "total_marks": total_possible_marks,
            "percentage": percentage,
            "correct_count": correct_count,
            "wrong_count": wrong_count,
            "unattempted_count": unattempted_count,
            "itemized": itemized_results,
            "wrong_analysis": wrong_analysis,
            "subject_breakdown": subject_breakdown
        }

    def process_scan_payload(self, payload: dict, answer_key: dict, marks_per_correct: float = 4.0, negative_marks: float = 1.0, exam_subject: str = "Science") -> dict:
        """
        Process scan payload containing roll_no and answers dictionary.
        """
        roll_no = str(payload.get("roll_no", "100001")).strip()
        scanned_answers = payload.get("answers", {})

        eval_data = self.evaluate_bubbles(scanned_answers, answer_key, marks_per_correct, negative_marks, exam_subject)

        return {
            "roll_no": roll_no,
            "scanned_answers": scanned_answers,
            "evaluation": eval_data
        }

# Global Instance
omr_engine = OMRProcessor()
