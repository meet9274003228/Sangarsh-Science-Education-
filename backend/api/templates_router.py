import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models.models import Template
from api.schemas import TemplateCreate, TemplateResponse

router = APIRouter(prefix="/api/templates", tags=["Templates"])

@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
def create_template(template: TemplateCreate, db: Session = Depends(get_db)):
    # Serialize JSON fields for DB persistence
    bubble_layout_str = json.dumps([item.dict() for item in template.bubble_layout]) if template.bubble_layout else None
    roll_number_str = json.dumps(template.roll_number_config.dict()) if template.roll_number_config else None
    alignment_markers_str = json.dumps([item.dict() for item in template.alignment_markers]) if template.alignment_markers else None
    question_regions_str = json.dumps(template.question_regions) if template.question_regions else None
    student_id_region_str = json.dumps(template.student_id_region) if template.student_id_region else None

    db_template = Template(
        name=template.name,
        questions_count=template.questions_count,
        options_count=template.options_count,
        sheet_width=template.sheet_width,
        sheet_height=template.sheet_height,
        bubble_layout_json=bubble_layout_str,
        roll_number_config_json=roll_number_str,
        alignment_markers_json=alignment_markers_str,
        question_regions_json=question_regions_str,
        student_id_region_json=student_id_region_str,
        fill_threshold_high=template.fill_threshold_high,
        fill_threshold_low=template.fill_threshold_low,
        margin_threshold=template.margin_threshold
    )
    
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template

@router.get("", response_model=List[TemplateResponse])
def get_templates(db: Session = Depends(get_db)):
    return db.query(Template).all()

@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(template_id: int, db: Session = Depends(get_db)):
    db_template = db.query(Template).filter(Template.id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")
    return db_template

@router.put("/{template_id}", response_model=TemplateResponse)
def update_template(template_id: int, template: TemplateCreate, db: Session = Depends(get_db)):
    db_template = db.query(Template).filter(Template.id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    db_template.name = template.name
    db_template.questions_count = template.questions_count
    db_template.options_count = template.options_count
    db_template.sheet_width = template.sheet_width
    db_template.sheet_height = template.sheet_height
    db_template.fill_threshold_high = template.fill_threshold_high
    db_template.fill_threshold_low = template.fill_threshold_low
    db_template.margin_threshold = template.margin_threshold
    
    db_template.bubble_layout_json = json.dumps([item.dict() for item in template.bubble_layout]) if template.bubble_layout else None
    db_template.roll_number_config_json = json.dumps(template.roll_number_config.dict()) if template.roll_number_config else None
    db_template.alignment_markers_json = json.dumps([item.dict() for item in template.alignment_markers]) if template.alignment_markers else None
    db_template.question_regions_json = json.dumps(template.question_regions) if template.question_regions else None
    db_template.student_id_region_json = json.dumps(template.student_id_region) if template.student_id_region else None
    
    db.commit()
    db.refresh(db_template)
    return db_template

@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: int, db: Session = Depends(get_db)):
    db_template = db.query(Template).filter(Template.id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(db_template)
    db.commit()
    return None
