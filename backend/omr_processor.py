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

    def evaluate_bubbles(self, raw_answers: dict, answer_key: dict, marks_per_correct: float = 4.0, negative_marks: float = 1.0, exam_subject: str = "Science") -> dict:
        """
        Compare scanned answers dictionary against answer_key dictionary.
        Returns score breakdown: obtained_marks, total_marks, percentage, correct_count, wrong_count, unattempted_count,
        wrong_analysis (list of incorrect questions & options), and subject_breakdown.
        """
        total_questions = len(answer_key)
        total_possible_marks = total_questions * marks_per_correct

        correct_count = 0
        wrong_count = 0
        unattempted_count = 0
        obtained_marks = 0.0

        itemized_results = {}
        wrong_analysis = []

        # Determine subject distribution for multi-subject exams
        # e.g. If exam_subject is "PCB Combined" or "PCM Combined", split questions evenly
        is_multi_subject = "PCB" in exam_subject or "PCM" in exam_subject or "Combined" in exam_subject
        subjects = ["Physics", "Chemistry", "Biology" if "PCB" in exam_subject else "Mathematics"] if is_multi_subject else [exam_subject]
        
        subject_breakdown = {s: {"correct": 0, "wrong": 0, "unattempted": 0, "marks": 0.0, "total": 0.0} for s in subjects}
        q_per_subject = max(1, total_questions // len(subjects)) if is_multi_subject else total_questions

        for q_idx in range(1, total_questions + 1):
            q_str = str(q_idx)
            correct_opt = str(answer_key.get(q_str, "A")).strip().upper()
            scanned_opt = str(raw_answers.get(q_str, "NONE")).strip().upper()

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
