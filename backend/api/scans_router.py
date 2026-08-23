import os
import uuid
import json
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models.models import Scan, ScanResult, QuestionResult, Exam, Template
from api.schemas import ScanDetailResponse
from omr.omr_engine import omr_pipeline

router = APIRouter(prefix="/api", tags=["Scans"])

# Global upload setup
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/exams/{exam_id}/scan", response_model=ScanDetailResponse, status_code=status.HTTP_201_CREATED)
async def scan_sheet(exam_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    # 1. Verify exam exist
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    # 2. Verify template associated exists
    template = db.query(Template).filter(Template.id == exam.template_id).first()
    if not template:
        raise HTTPException(status_code=400, detail="Associated Template not found")

    # 3. Save uploaded file to local disk
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    target_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    try:
        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

    # 4. Initialize database scan record in PENDING state
    db_scan = Scan(
        exam_id=exam_id,
        original_image_path=target_path,
        scan_status="PENDING",
        confidence_score=0.0
    )
    db.add(db_scan)
    db.commit()
    db.refresh(db_scan)

    # 5. Execute OMR Processing
    try:
        answer_key = json.loads(exam.answer_key_json) if exam.answer_key_json else {}
        template_config = {
            "questions_count": template.questions_count,
            "options_count": template.options_count,
            "bubble_layout": json.loads(template.bubble_layout_json) if template.bubble_layout_json else [],
            "fill_threshold_high": template.fill_threshold_high if (hasattr(template, "fill_threshold_high") and template.fill_threshold_high is not None) else 0.25,
            "fill_threshold_low": template.fill_threshold_low if (hasattr(template, "fill_threshold_low") and template.fill_threshold_low is not None) else 0.10,
            "margin_threshold": template.margin_threshold if (hasattr(template, "margin_threshold") and template.margin_threshold is not None) else 0.15
        }
        scoring_scheme = {
            "marks_per_correct": exam.marks_per_correct,
            "negative_marks": exam.negative_marks,
            "blank_marks": exam.blank_marks
        }
        
        # Invoke CV Pipeline wrapper
        pipeline_result = omr_pipeline.process_omr_sheet(
            image_input=target_path,
            template_config=template_config,
            answer_key=answer_key,
            scoring_scheme=scoring_scheme,
            output_directory=UPLOAD_DIR
        )
        
        # 6. Parse and store pipeline results
        db_scan.student_roll_no = pipeline_result.get("student_roll_no")
        db_scan.student_name = pipeline_result.get("student_name")
        db_scan.confidence_score = pipeline_result.get("confidence_score")
        db_scan.scan_status = pipeline_result.get("scan_status", "SUCCEEDED")
        db_scan.processed_image_path = pipeline_result.get("debug_image_url") or target_path
        
        # Create ScanResult
        eval_data = pipeline_result.get("result") or {}
        db_result = ScanResult(
            scan_id=db_scan.id,
            obtained_marks=eval_data.get("obtained_marks", 0.0),
            total_marks=eval_data.get("total_marks", 0.0),
            percentage=eval_data.get("percentage", 0.0),
            correct_count=eval_data.get("correct_count", 0),
            wrong_count=eval_data.get("wrong_count", 0),
            blank_count=eval_data.get("blank_count", 0),
            multiple_marked_count=eval_data.get("multiple_marked_count", 0),
            uncertain_count=eval_data.get("uncertain_count", 0)
        )
        db.add(db_result)
        db.commit() # Save result so we get result.id
        db.refresh(db_result)

        # Store question level details
        question_results = []
        for q_res in eval_data.get("question_results", []):
            db_q_res = QuestionResult(
                scan_result_id=db_result.id,
                question_no=q_res["question_no"],
                selected_option=q_res["selected_option"],
                correct_option=q_res["correct_option"],
                status=q_res["status"],
                options_intensity_json=q_res["options_intensity_json"],
                bounding_box_json=q_res["bounding_box_json"]
            )
            question_results.append(db_q_res)
            
        db.bulk_save_objects(question_results)
        db.commit()
        db.refresh(db_scan)
        
    except Exception as e:
        db_scan.scan_status = "FAILED"
        db_scan.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"OMR pipeline processing failed: {str(e)}")

    return db_scan

@router.post("/omr/scan", status_code=status.HTTP_200_OK)
async def scan_omr_template_directly(
    template_id: int,
    image: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Directly scans a sheet against a template without mapping to a specific student/exam record.
    Useful for testing template layouts or visual validation checkouts.
    """
    # 1. Fetch template
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    # 2. Read image content
    try:
        image_content = await image.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read image upload contents: {str(e)}")
        
    # 3. Create dummy scoring scheme and answer key
    dummy_answer_key = {}
    if template.questions_count:
        for q in range(1, template.questions_count + 1):
            dummy_answer_key[str(q)] = "A" # Dummy answer key defaults to A
            
    template_config = {
        "questions_count": template.questions_count,
        "options_count": template.options_count,
        "sheet_width": template.sheet_width,
        "sheet_height": template.sheet_height,
        "bubble_layout": json.loads(template.bubble_layout_json) if template.bubble_layout_json else [],
        "fill_threshold_high": template.fill_threshold_high if (hasattr(template, "fill_threshold_high") and template.fill_threshold_high is not None) else 0.25,
        "fill_threshold_low": template.fill_threshold_low if (hasattr(template, "fill_threshold_low") and template.fill_threshold_low is not None) else 0.10,
        "margin_threshold": template.margin_threshold if (hasattr(template, "margin_threshold") and template.margin_threshold is not None) else 0.15
    }
    
    scoring_scheme = {
        "marks_per_correct": 1.0,
        "negative_marks": 0.0,
        "blank_marks": 0.0
    }
    
    # 4. Invoke pipeline
    try:
        pipeline_result = omr_pipeline.process_omr_sheet(
            image_input=image_content,
            template_config=template_config,
            answer_key=dummy_answer_key,
            scoring_scheme=scoring_scheme,
            output_directory=UPLOAD_DIR
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OMR Direct Scan CV failure: {str(e)}")
        
    if pipeline_result.get("scan_status") == "FAILED":
        return {
            "processed_image_url": None,
            "student_roll_no": None,
            "student_name": None,
            "confidence_score": 0.0,
            "detected_answers": {},
            "question_statuses": [],
            "processing_errors": pipeline_result.get("processing_errors", ["CV Scanning pipeline crashed during operations."])
        }
        
    # Map output response structure
    detected = {}
    question_statuses = []
    
    eval_data = pipeline_result.get("result") or {}
    for q_res in eval_data.get("question_results", []):
        q_num = str(q_res["question_no"])
        detected[q_num] = q_res["selected_option"]
        question_statuses.append({
            "question_number": q_res["question_no"],
            "options": json.loads(q_res["options_intensity_json"]),
            "selected_answer": q_res["selected_option"],
            "confidence": q_res.get("confidence", 1.0)
        })
        
    return {
        "processed_image_url": pipeline_result.get("debug_image_url"),
        "student_roll_no": pipeline_result.get("student_roll_no"),
        "student_name": pipeline_result.get("student_name"),
        "confidence_score": pipeline_result.get("confidence_score"),
        "detected_answers": detected,
        "question_statuses": question_statuses,
        "processing_errors": []
    }

@router.get("/scans/{scan_id}", response_model=ScanDetailResponse)
def get_scan(scan_id: int, db: Session = Depends(get_db)):
    db_scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not db_scan:
        raise HTTPException(status_code=404, detail="Scan result not found")
    return db_scan

@router.get("/exams/{exam_id}/scans", response_model=List[ScanDetailResponse])
def get_exam_scans(exam_id: int, db: Session = Depends(get_db)):
    # Verify exam exists
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return db.query(Scan).filter(Scan.exam_id == exam_id).all()

from omr.evaluation.evaluator import evaluate_scanned_sheet
from api.schemas import ScanResultResponse

@router.post("/scans/{scan_id}/evaluate", response_model=ScanDetailResponse)
def evaluate_scan(scan_id: int, db: Session = Depends(get_db)):
    db_scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not db_scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if db_scan.scan_status != "SUCCEEDED":
        raise HTTPException(status_code=400, detail=f"Cannot evaluate scan with database status: {db_scan.scan_status}")
    
    exam = db_scan.exam
    if not exam:
        raise HTTPException(status_code=400, detail="Exam associated with scan not found")
        
    answer_key = json.loads(exam.answer_key_json) if exam.answer_key_json else {}
    marking_scheme = {
        "marks_per_correct": exam.marks_per_correct,
        "negative_marks": exam.negative_marks,
        "blank_marks": exam.blank_marks
    }
    
    # Retrieve existing question results
    if not db_scan.result:
        raise HTTPException(status_code=400, detail="Scan result details are missing. Re-scan required.")
        
    question_results = db_scan.result.question_results
    
    # Construct detected_answers input for evaluator.py
    detected_answers = {}
    q_map = {}
    for q_res in question_results:
        # Determine raw status
        status_val = q_res.status
        opt_val = q_res.selected_option
        
        # Infer original bubble detection status
        raw_status = "SINGLE_MARKED"
        if opt_val == "" or opt_val is None:
            raw_status = "BLANK"
        elif status_val == "MULTIPLE_MARKED" or opt_val == "MULTIPLE":
            raw_status = "MULTIPLE_MARKED"
        elif status_val == "UNCERTAIN" or status_val.startswith("UNCERTAIN_"):
            raw_status = "UNCERTAIN"
            
        detected_answers[str(q_res.question_no)] = {
            "selected_option": opt_val or "",
            "status": raw_status
        }
        q_map[q_res.question_no] = q_res
        
    # Run standalone evaluation logic
    eval_result = evaluate_scanned_sheet(detected_answers, answer_key, marking_scheme)
    sum_data = eval_result["summary"]
    item_data = eval_result["itemized"]
    
    # Update ScanResult
    db_scan.result.obtained_marks = sum_data["final_score"]
    db_scan.result.total_marks = len(item_data) * exam.marks_per_correct
    db_scan.result.percentage = sum_data["percentage"]
    db_scan.result.correct_count = sum_data["correct"]
    db_scan.result.wrong_count = sum_data["wrong"]
    db_scan.result.blank_count = sum_data["blank"]
    db_scan.result.multiple_marked_count = sum_data["multiple_marked"]
    db_scan.result.uncertain_count = sum_data["uncertain"]
    
    # Update QuestionResult
    for item in item_data:
        q_num = item["question_no"]
        if q_num in q_map:
            db_q_res = q_map[q_num]
            # correct_option raw serialization: if correct_option list has elements, join to CSV string or JSON
            co_list = item["correct_option"]
            db_q_res.correct_option = ",".join(co_list) if co_list else ""
            db_q_res.status = item["status"]
            db_q_res.selected_option = item["selected_option"] if item["selected_option"] not in ("MULTIPLE", "") else None
            
    db.commit()
    db.refresh(db_scan)
    return db_scan

@router.get("/scans/{scan_id}/result", response_model=ScanResultResponse)
def get_scan_result(scan_id: int, db: Session = Depends(get_db)):
    db_scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not db_scan:
        raise HTTPException(status_code=404, detail="Scan result not found")
    if not db_scan.result:
        raise HTTPException(status_code=400, detail="Scan result evaluation metrics do not exist")
    return db_scan.result


from models.models import AuditLog
from api.schemas import CorrectionRequest

@router.post("/scans/{scan_id}/correct", response_model=ScanDetailResponse)
def correct_scan_question(scan_id: int, correction: CorrectionRequest, db: Session = Depends(get_db)):
    """Manually correct a question answer, recalculate marks, and add audit trail."""
    db_scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not db_scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if not db_scan.result:
        raise HTTPException(status_code=400, detail="Scan has no result to correct")

    # Find question result
    target_qr = None
    for qr in db_scan.result.question_results:
        if qr.question_no == correction.question_no:
            target_qr = qr
            break
    if not target_qr:
        raise HTTPException(status_code=404, detail=f"Question {correction.question_no} not found in scan results")

    old_value = target_qr.selected_option or ""
    new_value = correction.corrected_option

    # Create audit log entry
    audit = AuditLog(
        scan_id=scan_id,
        question_no=correction.question_no,
        old_value=old_value,
        new_value=new_value
    )
    db.add(audit)

    # Update the question result
    target_qr.selected_option = new_value
    target_qr.status = "SINGLE_MARKED"  # Reset from UNCERTAIN to marked

    # Re-evaluate all questions against the answer key
    exam = db_scan.exam
    answer_key = json.loads(exam.answer_key_json) if exam.answer_key_json else {}
    marking_scheme = {
        "marks_per_correct": exam.marks_per_correct,
        "negative_marks": exam.negative_marks,
        "blank_marks": exam.blank_marks
    }

    detected_answers = {}
    for qr in db_scan.result.question_results:
        raw_status = "SINGLE_MARKED"
        opt_val = qr.selected_option
        if opt_val == "" or opt_val is None:
            raw_status = "BLANK"
        elif qr.status == "MULTIPLE_MARKED" or opt_val == "MULTIPLE":
            raw_status = "MULTIPLE_MARKED"
        elif qr.status == "UNCERTAIN":
            raw_status = "UNCERTAIN"
        detected_answers[str(qr.question_no)] = {
            "selected_option": opt_val or "",
            "status": raw_status
        }

    eval_result = evaluate_scanned_sheet(detected_answers, answer_key, marking_scheme)
    sum_data = eval_result["summary"]
    item_data = eval_result["itemized"]

    # Update ScanResult totals
    db_scan.result.obtained_marks = sum_data["final_score"]
    db_scan.result.total_marks = len(item_data) * exam.marks_per_correct
    db_scan.result.percentage = sum_data["percentage"]
    db_scan.result.correct_count = sum_data["correct"]
    db_scan.result.wrong_count = sum_data["wrong"]
    db_scan.result.blank_count = sum_data["blank"]
    db_scan.result.multiple_marked_count = sum_data["multiple_marked"]
    db_scan.result.uncertain_count = sum_data["uncertain"]

    # Update individual question statuses
    q_map = {qr.question_no: qr for qr in db_scan.result.question_results}
    for item in item_data:
        q_num = item["question_no"]
        if q_num in q_map:
            db_qr = q_map[q_num]
            co_list = item["correct_option"]
            db_qr.correct_option = ",".join(co_list) if co_list else ""
            db_qr.status = item["status"]

    db.commit()
    db.refresh(db_scan)
    return db_scan

