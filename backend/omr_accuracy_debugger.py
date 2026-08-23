import os
import sys
import time
import json
import argparse
import cv2
import numpy as np
from typing import Any, Dict, List, Tuple

# Ensure backend directory is in python search path if running raw
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from omr.omr_engine import omr_pipeline
from omr.image_processing.preprocess import load_image, preprocess_image
from omr.detection.marker_detector import detect_registration_markers
from omr.image_processing.perspective import warp_perspective_sheet
from omr.detection.bubble_detector import extract_bubble_roi

def generate_question_roi_strip(
    warped_image: np.ndarray,
    bubbles_list: list,
    fill_ratios: dict,
    question_no: int,
    expected: str,
    detected: str,
    confidence: float
) -> np.ndarray:
    """
    Creates a horizontally stitched collage layout of bubble crops for a specific question,
    clearly labeled with options, fill ratios, expected answer, and classification result.
    """
    num_options = len(bubbles_list)
    block_w = 80
    block_h = 120
    
    # 3-channel canvas
    canvas = np.ones((block_h, num_options * block_w, 3), dtype=np.uint8) * 255
    
    for idx, b_cfg in enumerate(bubbles_list):
        opt_name = b_cfg.get("option", chr(65 + idx))
        roi = extract_bubble_roi(warped_image, b_cfg, 800, 1100)
        
        # Color conversion if single channel
        if roi is not None and roi.size > 0:
            if len(roi.shape) == 2:
                roi_color = cv2.cvtColor(roi, cv2.COLOR_GRAY2BGR)
            else:
                roi_color = roi.copy()
            roi_resized = cv2.resize(roi_color, (40, 40))
            # Border highlight
            cv2.rectangle(roi_resized, (0, 0), (39, 39), (200, 200, 200), 1)
        else:
            roi_resized = np.ones((40, 40, 3), dtype=np.uint8) * 230
            
        bx_start = idx * block_w
        cy_start = 20
        canvas[cy_start:cy_start+40, bx_start+20:bx_start+60] = roi_resized
        
        # Option Label
        cv2.putText(canvas, opt_name, (bx_start + 32, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
        
        # Fill ratio text
        fr = fill_ratios.get(opt_name, 0.0)
        color = (0, 150, 0) if fr >= 0.15 else (100, 100, 100)
        cv2.putText(canvas, f"{fr:.2f}", (bx_start + 18, 105), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)
        
    # Top header bar
    summary_text = f"Q{question_no} | Exp: {expected or 'BLANK'} | Det: {detected or 'BLANK'} | Conf: {confidence:.2f}"
    header_bar = np.ones((30, canvas.shape[1], 3), dtype=np.uint8) * 225
    cv2.putText(header_bar, summary_text, (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1, cv2.LINE_AA)
    
    # Border separates modules
    final_strip = np.vstack([header_bar, canvas])
    cv2.rectangle(final_strip, (0, 0), (final_strip.shape[1]-1, final_strip.shape[2]-1 if len(final_strip.shape) > 2 else final_strip.shape[0]-1), (120, 120, 120), 2)
    
    return final_strip

def normalize_response(val: Any) -> str:
    """Normalizes empty strings, list-like answers, and standard strings to standard codes."""
    if val is None:
        return ""
    if isinstance(val, list):
        if len(val) == 0:
            return ""
        if len(val) > 1:
            return "MULTIPLE"
        val = val[0]
    val_str = str(val).strip().upper()
    if val_str in ("BLANK", "EMPTY", "NONE", ""):
        return ""
    if val_str in ("MULTIPLE", "MULTIPLE_MARKED", "MULTI"):
        return "MULTIPLE"
    return val_str

def parse_args():
    parser = argparse.ArgumentParser(description="OMR Sheet Accuracy Evaluation and Debugger Suite")
    parser.add_argument("--images-dir", required=True, help="Directory containing OMR scan images")
    parser.add_argument("--ground-truth", required=True, help="JSON File path containing expected answers")
    parser.add_argument("--template-config", help="Optional Template layout configuration JSON filepath")
    parser.add_argument("--debug", action="store_true", help="Enable verbose tracing and output collages for all questions")
    parser.add_argument("--debug-output-dir", default="./debug_rois", help="Dir path to store bubble debug ROI collages")
    return parser.parse_args()

def main():
    args = parse_args()
    
    if not os.path.exists(args.images_dir):
        print(f"[-] Error: Images directory not found: {args.images_dir}")
        sys.exit(1)
        
    if not os.path.exists(args.ground_truth):
        print(f"[-] Error: Ground truth JSON file not found: {args.ground_truth}")
        sys.exit(1)
        
    # Read Ground Truth
    with open(args.ground_truth, "r") as f:
        ground_truth = json.load(f)
        
    # Read Custom template configuration if specified
    template_config = None
    if args.template_config:
        if os.path.exists(args.template_config):
            with open(args.template_config, "r") as f:
                template_config = json.load(f)
        else:
            print(f"[-] Warning: Template config path {args.template_config} not found. Falling back to default.")
            
    # Default template fallback matches default 5 question configuration
    if not template_config:
        # Default layout config
        template_config = {
            "sheet_width": 800,
            "sheet_height": 1100,
            "questions_count": 5,
            "options_count": 4,
            "fill_threshold_high": 0.25,
            "fill_threshold_low": 0.10,
            "margin_threshold": 0.15,
            "bubble_layout": []
        }
        for q in range(1, 6):
            bubbles = []
            by = 220 + q * 110
            for o in range(4):
                bx = 220 + o * 120
                bubbles.append({
                    "option": chr(65 + o),
                    "x": bx,
                    "y": by,
                    "width": 24,
                    "height": 24,
                    "normalized_x": bx / 800.0,
                    "normalized_y": by / 1100.0,
                    "normalized_width": 24.0 / 800.0,
                    "normalized_height": 24.0 / 1100.0
                })
            template_config["bubble_layout"].append({
                "question_no": q,
                "bubbles": bubbles
            })

    os.makedirs(args.debug_output_dir, exist_ok=True)
    
    print("\n" + "="*80)
    print("STARTING OMR SCANNER ACCURACY & ROBUSTNESS DEBUGGER")
    print("="*80)
    print(f"Images Dir        : {args.images_dir}")
    print(f"Ground Truth File : {args.ground_truth}")
    print(f"Debug Mode        : {'ENABLED' if args.debug else 'DISABLED'}")
    print(f"Debug Output Dir  : {args.debug_output_dir}")
    print("="*80 + "\n")
    
    overall_correct = 0
    overall_questions = 0
    
    overall_expected_blanks = 0
    overall_correct_blanks = 0
    
    overall_expected_multi = 0
    overall_correct_multi = 0
    
    overall_uncertains = 0
    overall_processing_time = 0.0
    
    failed_cases_log = []
    image_reports = []
    
    # Extract images
    image_names = [f for f in os.listdir(args.images_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff', '.webp', '.bmp'))]
    if not image_names:
        print("[-] Error: No matching OMR images found in directory.")
        sys.exit(1)
        
    image_names.sort()
    
    for filename in image_names:
        filepath = os.path.join(args.images_dir, filename)
        
        # Match with ground truth key (either filename or full path)
        gt_key = filename
        if filename not in ground_truth:
            # Check key match by basename
            matched = False
            for k in ground_truth.keys():
                if os.path.basename(k) == filename:
                    gt_key = k
                    matched = True
                    break
            if not matched:
                print(f"[!] Warning: No ground truth entry found for '{filename}'. Skipping.")
                continue
                
        expected_ans_map = {str(q): normalize_response(ans) for q, ans in ground_truth[gt_key].items()}
        
        # Load local image for manual perspective warping in case we want to crop ROIs
        try:
            raw_img = load_image(filepath)
        except Exception as e:
            print(f"[-] Failed to load image {filename}: {str(e)}")
            continue
            
        # Run OMR Pipeline
        start_t = time.time()
        try:
            with open(filepath, "rb") as f:
                img_bytes = f.read()
            res = omr_pipeline.process_omr_sheet(
                image_input=img_bytes,
                template_config=template_config,
                answer_key=expected_ans_map, # Matches expectations
                scoring_scheme={"marks_per_correct": 1.0, "negative_marks": 0.0, "blank_marks": 0.0},
                output_directory=None
            )
        except Exception as ex:
            print(f"[-] Pipeline crashed scanning {filename}: {str(ex)}")
            continue
        elapsed = time.time() - start_t
        overall_processing_time += elapsed
        
        if res.get("scan_status") != "SUCCEEDED":
            errors = ",".join(res.get("processing_errors", ["Unknown Error"]))
            print(f"[-] Scan Failed: {filename} -> {errors}")
            failed_cases_log.append({
                "filename": filename,
                "error": f"Alignment/Scan registration failed: {errors}"
            })
            continue
            
        # Parse detected results
        q_results = res["result"]["question_results"]
        detected_answers = {}
        correct_detections = 0
        incorrect_detections = []
        
        img_expected_blanks = 0
        img_correct_blanks = 0
        img_expected_multi = 0
        img_correct_multi = 0
        img_uncertains = 0
        
        # Extract Warped Image for Debug ROIs
        warped_image = None
        
        for q_entry in q_results:
            q_num = str(q_entry["question_no"])
            detected_status = q_entry["status"] # e.g. "CORRECT", "WRONG", "BLANK", "UNCERTAIN", "MULTIPLE_MARKED"
            confidence = q_entry["confidence"]
            intensity_details = json.loads(q_entry["options_intensity_json"])
            
            # Map detected answer
            # Map statuses directly
            # Wait, the status returned is relative to correctness score. Let's look at the detected answer.
            # We can parse the selected option
            raw_sel = q_entry.get("selected_option") # Option choice letter or None/empty
            
            # Reconstruct the classification status of the detector
            # Let's inspect the intensities to see if it was blank/multiple
            fill_ratios = {opt: data["fill_ratio"] for opt, data in intensity_details.items()}
            
            # Rerun classification evaluation helper
            from omr.detection.classifier import evaluate_question_choices
            eval_class = evaluate_question_choices(
                fill_ratios,
                fill_threshold_high=template_config.get("fill_threshold_high", 0.25),
                fill_threshold_low=template_config.get("fill_threshold_low", 0.10),
                margin_threshold=template_config.get("margin_threshold", 0.15)
            )
            
            det_class_status = eval_class["status"] # "SINGLE_MARKED", "BLANK", "MULTIPLE_MARKED", "UNCERTAIN"
            
            # Map detected response
            if det_class_status == "BLANK":
                detected_ans = ""
            elif det_class_status == "MULTIPLE_MARKED":
                detected_ans = "MULTIPLE"
            else:
                detected_ans = eval_class["selected_option"] # option A/B/C/D
                
            detected_answers[q_num] = detected_ans
            expected_ans = expected_ans_map.get(q_num, "")
            
            # Update blank count trackers
            if expected_ans == "":
                img_expected_blanks += 1
                if det_class_status == "BLANK":
                    img_correct_blanks += 1
                    
            if expected_ans == "MULTIPLE":
                img_expected_multi += 1
                if det_class_status == "MULTIPLE_MARKED":
                    img_correct_multi += 1
                    
            if det_class_status == "UNCERTAIN":
                img_uncertains += 1
                
            # Verify correctness against Ground Truth expectation
            if detected_ans == expected_ans:
                correct_detections += 1
                is_correct = True
            else:
                is_correct = False
                
            # Log failure case if incorrect
            if not is_correct:
                incorrect_detections.append({
                    "question_no": q_num,
                    "expected": expected_ans,
                    "detected": detected_ans,
                    "status": det_class_status,
                    "fill_ratios": fill_ratios,
                    "confidence": confidence
                })
                
            # Generate ROI Strip for failure OR if --debug flag is active
            if (not is_correct) or args.debug:
                if warped_image is None:
                    # Manually warp image once per sheet to extract crops
                    h_orig, w_orig = raw_img.shape[:2]
                    w_oriented = raw_img.copy()
                    if w_orig > h_orig:
                        w_oriented = cv2.rotate(w_oriented, cv2.ROTATE_90_CLOCKWISE)
                    
                    try:
                        gray_img, binarized_img, scale_factor = preprocess_image(w_oriented)
                        detected_markers = detect_registration_markers(binarized_img, gray_img)
                        warped_image = warp_perspective_sheet(
                            w_oriented, detected_markers, scale_factor,
                            target_width=template_config.get("sheet_width", 800),
                            target_height=template_config.get("sheet_height", 1100)
                        )
                        # Flip check
                        try:
                            gray_warped = cv2.cvtColor(warped_image, cv2.COLOR_BGR2GRAY)
                            top_density = np.mean(gray_warped[30:150, 100:700])
                            bottom_density = np.mean(gray_warped[950:1070, 100:700])
                            if top_density > bottom_density:
                                warped_image = cv2.rotate(warped_image, cv2.ROTATE_180)
                        except Exception:
                            pass
                    except Exception as e:
                        print(f"[-] Warping for ROI extraction crashed on {filename}: {str(e)}")
                        
                if warped_image is not None:
                    # Find bubble detail layout config for this question
                    q_entry_details = next((x for x in template_config["bubble_layout"] if str(x["question_no"]) == q_num), None)
                    if q_entry_details:
                        strip = generate_question_roi_strip(
                            warped_image,
                            q_entry_details["bubbles"],
                            fill_ratios,
                            int(q_num),
                            expected_ans,
                            detected_ans,
                            confidence
                        )
                        label_tag = "fail" if not is_correct else "debug"
                        roi_filename = f"q{q_num}_{os.path.splitext(filename)[0]}_{label_tag}.png"
                        roi_filepath = os.path.join(args.debug_output_dir, roi_filename)
                        cv2.imwrite(roi_filepath, strip)
                        
                        # Add relative link inside results if incorrect
                        if not is_correct:
                            incorrect_detections[-1]["roi_image_path"] = roi_filepath

        total_q = len(expected_ans_map)
        overall_correct += correct_detections
        overall_questions += total_q
        
        overall_expected_blanks += img_expected_blanks
        overall_correct_blanks += img_correct_blanks
        overall_expected_multi += img_expected_multi
        overall_correct_multi += img_correct_multi
        overall_uncertains += img_uncertains
        
        blank_acc = (img_correct_blanks / img_expected_blanks) * 100 if img_expected_blanks > 0 else 100.0
        multi_acc = (img_correct_multi / img_expected_multi) * 100 if img_expected_multi > 0 else 100.0
        
        accuracy = (correct_detections / total_q) * 100 if total_q > 0 else 0.0
        
        print(f"[+] Evaluated: {filename.ljust(25)} | Correct: {str(correct_detections).rjust(2)}/{total_q} | Acc: {accuracy:5.1f}% | Uncertains: {img_uncertains} | Time: {elapsed:.2f}s")
        
        # Save details
        image_reports.append({
            "filename": filename,
            "total_questions": total_q,
            "correct": correct_detections,
            "accuracy": round(accuracy, 1),
            "blank_accuracy": round(blank_acc, 1) if img_expected_blanks > 0 else "N/A",
            "multiple_accuracy": round(multi_acc, 1) if img_expected_multi > 0 else "N/A",
            "uncertain_count": img_uncertains,
            "processing_time": round(elapsed, 3),
            "detected_answers": detected_answers,
            "expected_answers": expected_ans_map,
            "failures": incorrect_detections
        })
        
    print("\n" + "="*80)
    print("DETAILED ACCURACY REPORT SUMMARY")
    print("="*80)
    
    suite_accuracy = (overall_correct / overall_questions) * 100 if overall_questions > 0 else 0.0
    overall_blank_acc = (overall_correct_blanks / overall_expected_blanks) * 100 if overall_expected_blanks > 0 else 100.0
    overall_multi_acc = (overall_correct_multi / overall_expected_multi) * 100 if overall_expected_multi > 0 else 100.0
    
    print(f"Overall Classification Accuracy : {suite_accuracy:.2f}% ({overall_correct}/{overall_questions} bubbles)")
    print(f"Blank Detection Accuracy        : {overall_blank_acc:.2f}% ({overall_correct_blanks}/{overall_expected_blanks} blank zones)")
    print(f"Multiple-Mark Accuracy          : {overall_multi_acc:.2f}% ({overall_correct_multi}/{overall_expected_multi} multi-marks)")
    print(f"Total Uncertain Classifications : {overall_uncertains}")
    print(f"Total Suite Processing Time     : {overall_processing_time:.2f} seconds")
    print(f"Avg Processing Time Per Sheet   : {overall_processing_time/len(image_reports):.2f} seconds" if image_reports else "N/A")
    print("="*80 + "\n")
    
    # Listing all failures (Do not hide failures!)
    failures_total = 0
    for report in image_reports:
        if report["failures"]:
            print(f"Failures in sheet: {report['filename']}")
            for fail in report["failures"]:
                failures_total += 1
                roi_info = f", ROI: {fail['roi_image_path']}" if "roi_image_path" in fail else ""
                print(f"  - Q{fail['question_no']}: Expected '{fail['expected'] or 'BLANK'}', Detected '{fail['detected'] or 'BLANK'}' (Status: {fail['status']}, Conf: {fail['confidence']:.2f}{roi_info})")
                print("    Fill Ratios: ", ", ".join(f"{opt}: {val:.3f}" for opt, val in sorted(fail['fill_ratios'].items())))
                
    if failures_total == 0:
        print("[+] SUCCESS: No classification failures occurred in the entire suite!")
    else:
        print(f"\n[-] Total failures logged: {failures_total}")
        
    # Write json log
    summary_results_json = {
        "suite_metrics": {
            "overall_accuracy": round(suite_accuracy, 2),
            "overall_blank_accuracy": round(overall_blank_acc, 2),
            "overall_multiple_mark_accuracy": round(overall_multi_acc, 2),
            "total_uncertains": overall_uncertains,
            "total_processing_time": round(overall_processing_time, 3),
            "total_correct": overall_correct,
            "total_questions": overall_questions
        },
        "sheet_reports": image_reports,
        "failed_scans": failed_cases_log
    }
    
    results_out_path = os.path.join(args.debug_output_dir, "accuracy_suite_report.json")
    with open(results_out_path, "w") as f:
        json.dump(summary_results_json, f, indent=2)
    print(f"\n[+] Comprehensive JSON report saved: {results_out_path}")

if __name__ == "__main__":
    main()
