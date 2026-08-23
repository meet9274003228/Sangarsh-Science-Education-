import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict

from database import get_db
from models.models import Exam, Template, Scan, ScanResult
from api.schemas import ExamCreate, ExamResponse, ExamUpdateKey

router = APIRouter(prefix="/api/exams", tags=["Exams"])

@router.post("", response_model=ExamResponse, status_code=status.HTTP_201_CREATED)
def create_exam(exam: ExamCreate, db: Session = Depends(get_db)):
    # Validate template exists
    template = db.query(Template).filter(Template.id == exam.template_id).first()
    if not template:
        raise HTTPException(status_code=400, detail="Template ID does not exist")
    
    # Store answer key as JSON string
    answer_key_str = json.dumps(exam.answer_key) if exam.answer_key else json.dumps({})
    
    db_exam = Exam(
        name=exam.name,
        exam_type=exam.exam_type,
        subject=exam.subject,
        date=exam.date,
        template_id=exam.template_id,
        marks_per_correct=exam.marks_per_correct,
        negative_marks=exam.negative_marks,
        blank_marks=exam.blank_marks,
        answer_key_json=answer_key_str
    )
    
    db.add(db_exam)
    db.commit()
    db.refresh(db_exam)
    return db_exam

@router.get("", response_model=List[ExamResponse])
def get_exams(db: Session = Depends(get_db)):
    return db.query(Exam).all()

@router.get("/{exam_id}", response_model=ExamResponse)
def get_exam(exam_id: int, db: Session = Depends(get_db)):
    db_exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return db_exam

@router.post("/{exam_id}/answer-key", response_model=ExamResponse)
def create_answer_key(exam_id: int, key_update: ExamUpdateKey, db: Session = Depends(get_db)):
    db_exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    db_exam.answer_key_json = json.dumps(key_update.answer_key)
    db.commit()
    db.refresh(db_exam)
    return db_exam

@router.put("/{exam_id}/answer-key", response_model=ExamResponse)
def update_answer_key(exam_id: int, key_update: ExamUpdateKey, db: Session = Depends(get_db)):
    db_exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    db_exam.answer_key_json = json.dumps(key_update.answer_key)
    db.commit()
    db.refresh(db_exam)
    return db_exam

@router.get("/{exam_id}/answer-key")
def get_answer_key(exam_id: int, db: Session = Depends(get_db)):
    db_exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    key = json.loads(db_exam.answer_key_json) if db_exam.answer_key_json else {}
    return {"exam_id": exam_id, "answer_key": key}

@router.get("/{exam_id}/stats")
def get_exam_stats(exam_id: int, db: Session = Depends(get_db)):
    db_exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    scans = db.query(Scan).filter(Scan.exam_id == exam_id).all()
    total_scans = len(scans)
    
    # Calculate stats if we have scans
    average_score = 0.0
    highest_score = 0.0
    lowest_score = 0.0
    scanned_results = []
    
    for scan in scans:
        if scan.result:
            scanned_results.append(scan.result.obtained_marks)
            
    if scanned_results:
        average_score = round(sum(scanned_results) / len(scanned_results), 2)
        highest_score = max(scanned_results)
        lowest_score = min(scanned_results)
        
    return {
        "exam_id": exam_id,
        "exam_name": db_exam.name,
        "total_scans": total_scans,
        "average_score": average_score,
        "highest_score": highest_score,
        "lowest_score": lowest_score
    }

@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam(exam_id: int, db: Session = Depends(get_db)):
    db_exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not db_exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    db.delete(db_exam)
    db.commit()
    return None
