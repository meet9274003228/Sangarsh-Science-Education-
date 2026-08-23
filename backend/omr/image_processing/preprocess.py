import cv2
import numpy as np
from typing import Union, Tuple

def load_image(image_input: Union[str, bytes]) -> np.ndarray:
    """Loads image from file path or raw bytes."""
    if isinstance(image_input, bytes):
        nparr = np.frombuffer(image_input, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image from bytes.")
        return img
    elif isinstance(image_input, str):
        img = cv2.imread(image_input)
        if img is None:
            raise ValueError(f"Failed to read image from path: {image_input}")
        return img
    else:
        raise TypeError("image_input must be file path (str) or binary content (bytes).")

def preprocess_image(image: np.ndarray, max_width: int = 1200) -> Tuple[np.ndarray, np.ndarray, float]:
    """
    Grayscaling, blurs, and performs adaptive thresholding.
    Returns:
        - gray_image: grayscale scaled image
        - binarized_image: black/white inverted binary image (white foreground, black background)
        - scale_factor: scale ratio (resized_width / original_width)
    """
    h, w = image.shape[:2]
    
    # Calculate resizing scale factor
    scale_factor = 1.0
    if w > max_width:
        scale_factor = max_width / float(w)
        new_w = max_width
        new_h = int(h * scale_factor)
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
    else:
        resized = image.copy()

    # Convert to grayscale
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    
    # Noise reduction using Gaussian Blur
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Adaptive thresholding to segregate markings clearly
    # Uses THRESH_BINARY_INV so writing/marking becomes white (255) and card stock becomes black (0)
    thresh = cv2.adaptiveThreshold(
        blurred, 
        255, 
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY_INV, 
        11, 
        2
    )
    
    return gray, thresh, scale_factor
