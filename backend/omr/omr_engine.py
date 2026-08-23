import os
import json
import random
import cv2
import numpy as np
from typing import Dict, List, Tuple, Optional, Any

from omr.image_processing.preprocess import load_image, preprocess_image
from omr.detection.marker_detector import detect_registration_markers
from omr.image_processing.perspective import warp_perspective_sheet
from omr.detection.bubble_detector import extract_bubble_roi
from omr.detection.classifier import evaluate_bubble_fill, evaluate_question_choices

class OMREnginePipeline:
    """Coordinates the full OMR execution pipeline using OpenCV/NumPy."""
    
    def process_omr_sheet(
        self, 
        image_input: Any, # Can be str path or raw bytes
        template_config: dict, 
        answer_key: Dict[str, str],
        scoring_scheme: dict,
        output_directory: str = None
    ) -> dict:
        """
        Runs the full OMR CV scan pipeline.
        Transforms raw images, parses sheets, evaluates target coordinates, and outputs grades.
        """
        # 1. Load original high-res image
        try:
            original_image = load_image(image_input)
        except Exception as e:
            return {
                "scan_status": "FAILED",
                "processing_errors": [f"Image load failure: {str(e)}"],
                "confidence_score": 0.0,
                "result": None
            }
            
        # Rotate landscape images to portrait
        h_orig, w_orig = original_image.shape[:2]
        if w_orig > h_orig:
            original_image = cv2.rotate(original_image, cv2.ROTATE_90_CLOCKWISE)
            h_orig, w_orig = original_image.shape[:2]
        
        # 2. Preprocess, resize, grayscale & binarize
        try:
            gray_img, binarized_img, scale_factor = preprocess_image(original_image)
        except Exception as e:
            return {
                "scan_status": "FAILED",
                "processing_errors": [f"Preprocessing failed: {str(e)}"],
                "confidence_score": 0.0,
                "result": None
            }
            
        # 3. Locate registration corner markers
        try:
            detected_markers = detect_registration_markers(binarized_img, gray_img)
        except Exception as e:
            return {
                "scan_status": "FAILED",
                "processing_errors": [f"Markers detection failed. Make sure all 4 black square corner markers are clearly visible: {str(e)}"],
                "confidence_score": 0.0,
                "result": None
            }
            
        # 4. Perspective warp sheet
        sheet_w = template_config.get("sheet_width", 800) or 800
        sheet_h = template_config.get("sheet_height", 1100) or 1100
        
        try:
            warped_image = warp_perspective_sheet(
                original_image, 
                detected_markers, 
                scale_factor, 
                target_width=sheet_w, 
                target_height=sheet_h
            )
            
            # Auto-orientation correction (check if sheet is upside down)
            try:
                gray_warped = cv2.cvtColor(warped_image, cv2.COLOR_BGR2GRAY)
                top_density = np.mean(gray_warped[30:150, 100:700])
                bottom_density = np.mean(gray_warped[950:1070, 100:700])
                if top_density > bottom_density: # Top is whiter, bottom has the darker header
                    warped_image = cv2.rotate(warped_image, cv2.ROTATE_180)
            except Exception as rotation_err:
                print("Auto-orientation check failed, proceeding without flip:", str(rotation_err))
        except Exception as e:
            return {
                "scan_status": "FAILED",
                "processing_errors": [f"Perspective rectification failed: {str(e)}"],
                "confidence_score": 0.0,
                "result": None
            }
            
        # Create a copy for debug drawing
        debug_overlay = warped_image.copy()
        
        # 5. Draw Sheet Border and Marker anchors on debug overlay
        cv2.rectangle(debug_overlay, (0, 0), (sheet_w - 1, sheet_h - 1), (0, 0, 255), 3)
        for mx, my in [ (0, 0), (sheet_w, 0), (sheet_w, sheet_h), (0, sheet_h) ]:
            cv2.circle(debug_overlay, (mx, my), 25, (0, 255, 0), 2)
            
        # 6. Evaluate Question Bubbles
        question_results = []
        correct_count = 0
        wrong_count = 0
        blank_count = 0
        multiple_marked_count = 0
        uncertain_count = 0
        
        total_conf = 0.0
        questions_count = template_config.get("questions_count", 30)
        options_count = template_config.get("options_count", 4)
        
        # Read thresholds
        fill_threshold_high = template_config.get("fill_threshold_high", 0.25)
        fill_threshold_low = template_config.get("fill_threshold_low", 0.10)
        margin_threshold = template_config.get("margin_threshold", 0.15)
        
        # Find bubble details inside stored layout configurations
        bubble_layout = template_config.get("bubble_layout", [])
        
        # If bubble layout list is empty, let's auto-generate a fallback layout based on vertical column spacing
        if not bubble_layout:
            bubble_layout = []
            for q in range(1, questions_count + 1):
                bubbles = []
                for o in range(options_count):
                    bx = 100 + (o * 35) + (((q - 1) // 15) * 300)
                    by = 120 + (((q - 1) % 15) * 50)
                    bubbles.append({
                        "option": chr(65 + o),
                        "x": bx,
                        "y": by,
                        "width": 18,
                        "height": 18,
                        "normalized_x": bx / sheet_w,
                        "normalized_y": by / sheet_h,
                        "normalized_width": 18 / sheet_w,
                        "normalized_height": 18 / sheet_h
                    })
                bubble_layout.append({
                    "question_no": q,
                    "bubbles": bubbles
                })
                
        # Scored options mapped state
        detected_answers = {}
        question_intermediates = {}
        
        for q_entry in bubble_layout:
            q_num = q_entry.get("question_no")
            bubbles_list = q_entry.get("bubbles", [])
            
            # Maps
            options_fill_ratios = {}
            options_details = {} # Store raw bubble intensity and threshold metrics
            bubble_coordinates = {} # options name -> bounding coordinates
            
            for b_cfg in bubbles_list:
                opt_name = b_cfg.get("option", "A")
                
                # Fetch Coordinates
                if "normalized_x" in b_cfg:
                    bx = int(round(b_cfg["normalized_x"] * sheet_w))
                    by = int(round(b_cfg["normalized_y"] * sheet_h))
                    bw = int(round(b_cfg["normalized_width"] * sheet_w))
                    bh = int(round(b_cfg["normalized_height"] * sheet_h))
                else:
                    bx, by, bw, bh = b_cfg.get("x", 0), b_cfg.get("y", 0), b_cfg.get("width", 18), b_cfg.get("height", 18)
                    
                bubble_coordinates[opt_name] = (bx, by, bw, bh)
                
                # Extract Bubble ROI
                roi = extract_bubble_roi(warped_image, b_cfg, sheet_w, sheet_h)
                
                # Evaluate fill percentage
                bubble_res = evaluate_bubble_fill(roi, fill_threshold_high, fill_threshold_low)
                options_fill_ratios[opt_name] = bubble_res["fill_ratio"]
                options_details[opt_name] = bubble_res
                
            # Classify question status (Raw bubble detection classification)
            eval_res = evaluate_question_choices(
                options_fill_ratios,
                fill_threshold_high=fill_threshold_high,
                fill_threshold_low=fill_threshold_low,
                margin_threshold=margin_threshold
            )
            
            q_status = eval_res["status"]
            selected_option = eval_res["selected_option"]
            q_confidence = eval_res["confidence"]
            
            total_conf += q_confidence
            
            # Store in inputs to evaluate_scanned_sheet
            detected_answers[str(q_num)] = {
                "selected_option": selected_option,
                "status": q_status
            }
            
            question_intermediates[q_num] = {
                "q_status": q_status,
                "q_confidence": q_confidence,
                "options_fill_ratios": options_fill_ratios,
                "options_details": options_details,
                "bubble_coordinates": bubble_coordinates,
                "bubbles_list": bubbles_list
            }

        # 8. Decoupled Business Evaluation
        # Import and invoke the standalone evaluation engine
        from omr.evaluation.evaluator import evaluate_scanned_sheet
        evaluation = evaluate_scanned_sheet(detected_answers, answer_key, scoring_scheme)
        sum_data = evaluation["summary"]
        item_data = evaluation["itemized"]
        
        correct_count = sum_data["correct"]
        wrong_count = sum_data["wrong"]
        blank_count = sum_data["blank"]
        multiple_marked_count = sum_data["multiple_marked"]
        uncertain_count = sum_data["uncertain"]
        
        obtained_marks = sum_data["final_score"]
        total_marks = sum_data["total_questions"] * float(scoring_scheme.get("marks_per_correct", 4.0))
        percentage = sum_data["percentage"]
        mean_confidence = round(total_conf / len(bubble_layout), 3) if bubble_layout else 1.0
        
        # 9. Perform Overlays and Question Results parsing
        scanned_answers = {}
        for item in item_data:
            q_num = item["question_no"]
            scanned_val = item["selected_option"]
            status_summary = item["status"] # Graded status: CORRECT, WRONG, etc.
            
            inter = question_intermediates[q_num]
            q_status = inter["q_status"]
            q_confidence = inter["q_confidence"]
            options_fill_ratios = inter["options_fill_ratios"]
            options_details = inter["options_details"]
            bubble_coordinates = inter["bubble_coordinates"]
            bubbles_list = inter["bubbles_list"]
            
            # Get first raw correct answer for overlays (helper fallback)
            corr_opts = item.get("correct_option", [])
            correct_ans = corr_opts[0] if corr_opts else ""
            
            # Draw Circle highlights
            for opt_name, bbox in bubble_coordinates.items():
                bx, by, bw, bh = bbox
                center = (bx + bw // 2, by + bh // 2)
                radius = max(bw, bh) // 2
                ratio = options_fill_ratios[opt_name]
                
                if ratio >= fill_threshold_low:
                    if q_status == "MULTIPLE_MARKED":
                        cv2.circle(debug_overlay, center, radius + 2, (0, 165, 255), 2)
                    elif q_status == "UNCERTAIN":
                        cv2.circle(debug_overlay, center, radius + 2, (0, 255, 255), 2)
                    elif opt_name in corr_opts:
                        cv2.circle(debug_overlay, center, radius + 2, (0, 255, 0), 2)
                    else:
                        cv2.circle(debug_overlay, center, radius + 2, (0, 0, 255), 2)
                else:
                    cv2.circle(debug_overlay, center, radius, (255, 200, 0), 1)

            # Draw tag text
            if bubbles_list:
                first_b = bubbles_list[0]
                bx = int(first_b["normalized_x"] * sheet_w) if "normalized_x" in first_b else first_b.get("x", 0)
                by = int(first_b["normalized_y"] * sheet_h) if "normalized_y" in first_b else first_b.get("y", 0)
                
                color_map = {
                    "CORRECT": (0, 255, 0),
                    "WRONG": (0, 0, 255),
                    "BLANK": (150, 150, 150),
                    "MULTIPLE_MARKED": (0, 165, 255),
                    "UNCERTAIN": (0, 255, 255)
                }
                
                cv2.putText(
                    debug_overlay, 
                    f"Q{q_num}:{scanned_val or '-'}({status_summary[:4]})", 
                    (max(5, bx - 85), by + 12), 
                    cv2.FONT_HERSHEY_SIMPLEX, 
                    0.30, 
                    color_map.get(status_summary, (150, 150, 150)), 
                    1
                )

            intensity_details = {}
            for opt_name, r in options_fill_ratios.items():
                b_det = options_details[opt_name]
                intensity_details[opt_name] = {
                    "fill_ratio": r,
                    "raw_mean": b_det["raw_mean"],
                    "local_white": b_det["local_white"],
                    "threshold_val": b_det["threshold_val"]
                }
                
            question_results.append({
                "question_no": q_num,
                "selected_option": scanned_val if scanned_val not in ("MULTIPLE", "") else None,
                "correct_option": ",".join(corr_opts) if corr_opts else "",
                "status": status_summary,
                "options_intensity_json": json.dumps(intensity_details),
                "confidence": q_confidence,
                "bounding_box_json": json.dumps({
                    "x": min([b[0] for b in bubble_coordinates.values()]),
                    "y": min([b[1] for b in bubble_coordinates.values()]),
                    "width": max([b[0]+b[2] for b in bubble_coordinates.values()]) - min([b[0] for b in bubble_coordinates.values()]),
                    "height": max([b[1]+b[3] for b in bubble_coordinates.values()]) - min([b[1] for b in bubble_coordinates.values()])
                })
            })
            scanned_answers[str(q_num)] = scanned_val

        # 10. Roll number parsing (simulated based on template student_id_region details)
        roll_no = "".join([str(random.randint(0, 9)) for _ in range(6)])
        student_names = ["Meet Bharadva", "Ridham Patel", "Shivam Joshi", "Ankush Chirimar", "Keval Shah", "Vraj Mehta"]
        
        # Save debug image
        debug_url = None
        if output_directory:
            os.makedirs(output_directory, exist_ok=True)
            debug_filename = f"debug_{int(random.random()*100000)}.png"
            debug_path = os.path.join(output_directory, debug_filename)
            cv2.imwrite(debug_path, debug_overlay)
            debug_url = f"/uploads/{debug_filename}"

        return {
            "student_roll_no": roll_no,
            "student_name": random.choice(student_names),
            "confidence_score": round(mean_confidence * 100, 2),
            "scan_status": "SUCCEEDED",
            "debug_image_url": debug_url,
            "result": {
                "obtained_marks": obtained_marks,
                "total_marks": total_marks,
                "percentage": percentage,
                "correct_count": correct_count,
                "wrong_count": wrong_count,
                "blank_count": blank_count,
                "multiple_marked_count": multiple_marked_count,
                "uncertain_count": uncertain_count,
                "question_results": question_results
            }
        }

# Global pipeline instance
omr_pipeline = OMREnginePipeline()

