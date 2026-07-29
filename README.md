# Sangarsh Science Education — OMR Evaluation System 🚀

A full-stack, automated **OMR Evaluation and Analytics Platform** custom-designed for **Sangarsh Science Education**.

---

## 🌟 Key Features

1. **Admin Portal**: Authentication & Teacher Dashboard.
2. **Printable A4 OMR Sheet Generator**: Creates vector PDFs with 4 solid black alignment corner squares, 6-digit Roll Number bubble grid, and 4-option (A/B/C/D) question bubbles.
3. **Exam Management**: Interactive Answer Key Matrix builder (+marks per correct, -negative marks).
4. **OMR Scanning Engine**: OpenCV / Pixel darkness thresholding engine for corner detection, perspective transform (`warpPerspective`), roll number extraction, and option matching.
5. **Auto Evaluation & Result Analytics**: Student rank calculation, score breakdown, and percentage badges.
6. **Exports**: Export exam results to Excel / CSV format & printable student scorecards.

---

## 🛠️ Project Structure

```
├── backend/
│   ├── app.py           # REST API Web Server
│   ├── database.py      # SQLite Database Layer & Seeding
│   ├── pdf_generator.py # Vector A4 OMR Sheet PDF Generator
│   ├── omr_processor.py # OpenCV & Pixel Processing OMR Engine
│   ├── test_omr.py      # Standalone Terminal Test Utility
│   └── verify_all.py    # Verification Test Suite
├── frontend/
│   ├── index.html       # Single Page Application HTML
│   ├── styles.css       # Sangarsh Science Education Custom Styling
│   └── app.js           # Frontend SPA Engine
└── README.md
```

---

## 🚀 Running Locally

1. **Start Backend Server**:
   ```bash
   python3 backend/app.py 8080
   ```
2. **Access Web App**:
   Open `http://127.0.0.1:8080` in your web browser.

- **Admin Login**: `admin@sangarsh.edu`
- **Password**: `admin123`
