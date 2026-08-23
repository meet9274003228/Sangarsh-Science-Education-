import cv2
import numpy as np
from typing import List, Tuple, Dict

def detect_registration_markers(
    binarized_image: np.ndarray, 
    gray_image: np.ndarray,
    min_area: int = 150, 
    max_area: int = 8000
) -> List[Tuple[int, int]]:
    """
    Locates the 4 solid black square corner registration markers on the sheet.
    
    Args:
        binarized_image: Inverted binary image (markers are white / 255)
        gray_image: Grayscale image
        min_area: Minimum contour area threshold for a marker
        max_area: Maximum contour area threshold for a marker
        
    Returns:
        A list of exactly 4 corners sorted as:
        [top-left, top-right, bottom-right, bottom-left]
    """
    h, w = binarized_image.shape[:2]
    
    # 1. Find all contours
    contours, _ = cv2.findContours(binarized_image, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    candidates = []
    
    # 2. Filter candidates based on shape and solidity
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area or area > max_area:
            continue
            
        # Bounding box constraints
        bx, by, bw, bh = cv2.boundingRect(c)
        aspect_ratio = float(bw) / bh
        if aspect_ratio < 0.65 or aspect_ratio > 1.5:
            continue
            
        # Solidity checks (solid contours vs hollow circular lines)
        hull = cv2.convexHull(c)
        hull_area = cv2.contourArea(hull)
        solidity = area / hull_area if hull_area > 0 else 0
        if solidity < 0.8:
            continue
            
        # Extent checks (bounding box check)
        extent = area / (bw * bh)
        if extent < 0.6:
            continue
            
        # Calculate centroid (moments)
        M = cv2.moments(c)
        if M['m00'] <= 0:
            continue
        cx = int(M['m10'] / M['m00'])
        cy = int(M['m01'] / M['m00'])
        
        candidates.append((cx, cy, c, area))
        
    if len(candidates) < 4:
        raise ValueError(
            f"Failed to locate enough OMR registration markers. "
            f"Detected {len(candidates)} candidates, but exactly 4 are required."
        )
        
    # 3. Associate candidates with the 4 corners of the image bounds
    # Corners: Top-Left (0, 0), Top-Right (w, 0), Bottom-Right (w, h), Bottom-Left (0, h)
    corner_references = [
        ("top_left", (0, 0)),
        ("top_right", (w, 0)),
        ("bottom_right", (w, h)),
        ("bottom_left", (0, h))
    ]
    
    mapped_corners = {}
    remaining_candidates = list(candidates)
    
    for name, ref in corner_references:
        # Find the remaining candidate closest to this reference corner
        closest_idx = -1
        min_dist = float("inf")
        
        for idx, cand in enumerate(remaining_candidates):
            cx, cy = cand[0], cand[1]
            dist = (cx - ref[0])**2 + (cy - ref[1])**2
            if dist < min_dist:
                min_dist = dist
                closest_idx = idx
                
        if closest_idx != -1:
            mapped_corners[name] = remaining_candidates.pop(closest_idx)[:2]
            
    # Compile sorted result in order: top-left, top-right, bottom-right, bottom-left
    sorted_markers = [
        mapped_corners["top_left"],
        mapped_corners["top_right"],
        mapped_corners["bottom_right"],
        mapped_corners["bottom_left"]
    ]
    
    return sorted_markers
