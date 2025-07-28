#!/usr/bin/env python3
import pandas as pd
import json
from datetime import datetime

def clean_and_convert_data(filename):
    # Read Excel file, skipping the first row which contains the form link
    df = pd.read_excel(filename, sheet_name='ACL 25 Authors Assignments.', skiprows=1)
    
    # Clean up the data
    papers = []
    
    for index, row in df.iterrows():
        # Skip rows with missing essential data
        if pd.isna(row['Paper number']) or pd.isna(row['Title']):
            continue
            
        paper = {
            'paper_number': str(row['Paper number']),
            'title': str(row['Title']),
            'abstract': str(row['Abstract']) if not pd.isna(row['Abstract']) else '',
            'presenter_name': str(row['Presenters Name']) if not pd.isna(row['Presenters Name']) else '',
            'is_registered': str(row['Is Paper Registered?']) if not pd.isna(row['Is Paper Registered?']) else '',
            'presentation_type': str(row['Type of Presentation']) if not pd.isna(row['Type of Presentation']) else '',
            'attendance_type': str(row['Attendance Type']) if not pd.isna(row['Attendance Type']) else '',
            'room_location': str(row['Room Location']) if not pd.isna(row['Room Location']) else '',
            'session': str(row['Session']) if not pd.isna(row['Session']) else '',
            'session_title': str(row['Underline/Whova Session Titles']) if not pd.isna(row['Underline/Whova Session Titles']) else '',
            'session_date': row['Session Date'].strftime('%Y-%m-%d') if not pd.isna(row['Session Date']) else '',
            'session_time': str(row['Session time']) if not pd.isna(row['Session time']) else ''
        }
        
        papers.append(paper)
    
    print(f"Processed {len(papers)} papers")
    
    # Save to JSON
    with open('papers.json', 'w', encoding='utf-8') as f:
        json.dump(papers, f, indent=2, ensure_ascii=False)
    
    print("Data saved to papers.json")
    
    # Print some statistics
    presentation_types = {}
    for paper in papers:
        ptype = paper['presentation_type']
        presentation_types[ptype] = presentation_types.get(ptype, 0) + 1
    
    print("\nPresentation types:")
    for ptype, count in presentation_types.items():
        print(f"  {ptype}: {count}")

if __name__ == "__main__":
    clean_and_convert_data("ACL 2025 Paper Assignments for Program.xlsx")