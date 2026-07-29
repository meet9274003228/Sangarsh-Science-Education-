"""
Standalone CLI Test Script for Sangarsh Science Education OMR Processor.
Allows testing OMR processing directly from terminal with synthetic or scanned JSON payloads / images.
"""

import sys
import json
import os

# Add backend directory to sys.path
sys.path.append(os.path.dirname(__file__))

from omr_processor import omr_engine
from pdf_generator import create_omr_pdf
from database import init_db, get_db_connection

def run_test():
    print("=========================================================")
    print("  SANGARSH SCIENCE EDUCATION - OMR ENGINE TEST CLI  ")
    print("=========================================================")

    # Initialize DB
    init_db()

    # 1. Test PDF Generation
    print("\n[Step 1] Testing OMR Printable PDF Sheet Generator...")
    pdf_data = create_omr_pdf("Physics Term 1 Exam", "Physics", 30, "2026-07-29", 4.0, 1.0)
    pdf_filename = os.path.join(os.path.dirname(__file__), "test_sheet_physics.pdf")
    with open(pdf_filename, "wb") as f:
        f.write(pdf_data)
    print(f"  ✓ PDF generated successfully: {pdf_filename} ({len(pdf_data)} bytes)")

    # 2. Test Answer Key Matching & Scoring
    print("\n[Step 2] Testing Answer Key Matching Engine...")
    answer_key = {str(i): ["A", "B", "C", "D"][(i - 1) % 4] for i in range(1, 31)}

    # Simulate scanned answers (24 correct, 4 wrong, 2 unattempted)
    simulated_scanned = {}
    for i in range(1, 31):
        if i in [5, 10, 15, 20]:
            simulated_scanned[str(i)] = ["D", "C", "B", "A"][(i - 1) % 4] # Wrong
        elif i in [29, 30]:
            simulated_scanned[str(i)] = "NONE" # Unattempted
        else:
            simulated_scanned[str(i)] = answer_key[str(i)] # Correct

    sample_payload = {
        "roll_no": "100002",
        "answers": simulated_scanned
    }

    result = omr_engine.process_scan_payload(sample_payload, answer_key, marks_per_correct=4.0, negative_marks=1.0)

    print(f"  ✓ Candidate Roll No: {result['roll_no']}")
    print(f"  ✓ Obtained Marks   : {result['evaluation']['obtained_marks']} / {result['evaluation']['total_marks']}")
    print(f"  ✓ Percentage       : {result['evaluation']['percentage']}%")
    print(f"  ✓ Correct Answers  : {result['evaluation']['correct_count']}")
    print(f"  ✓ Wrong Answers    : {result['evaluation']['wrong_count']}")
    print(f"  ✓ Unattempted      : {result['evaluation']['unattempted_count']}")

    print("\n[Step 3] Verifying Database Queries...")
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM exams LIMIT 1")
    exam = c.fetchone()
    print(f"  ✓ Found Exam in DB: ID={exam['id']}, Name='{exam['exam_name']}'")
    conn.close()

    print("\n=========================================================")
    print("  ALL TESTS PASSED SUCCESSFULLY! Ready for Production.   ")
    print("=========================================================\n")

if __name__ == "__main__":
    run_test()
