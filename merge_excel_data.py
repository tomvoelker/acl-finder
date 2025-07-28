#!/usr/bin/env python3
"""
Merge ACL 2025 Excel scheduling data with papers.json
Handles special characters like German umlauts and includes presenter information.
"""

import pandas as pd
import json
import unicodedata
import re
from difflib import SequenceMatcher
from typing import Dict, List, Tuple, Any

def aggressive_normalize(text):
    """Very aggressive text normalization for better matching with special characters."""
    if not text:
        return ''
    
    text = str(text)
    
    # Handle German umlauts and other special characters
    replacements = {
        'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
        'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue',
        'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
        'ç': 'c', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
        'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
        'ñ': 'n', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
        'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
        'ý': 'y', 'ÿ': 'y', 'œ': 'oe', 'æ': 'ae',
        '–': '-', '—': '-', '“': '"', '”': '"', '‘': "'", '’': "'",
        '…': '...', '′': "'", '″': '"', '‴': '"'
    }
    
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    
    # Normalize unicode to ASCII
    text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
    
    # Convert to lowercase
    text = text.lower()
    
    # Remove common words and variations that might differ
    stop_words = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
        'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
        'before', 'after', 'above', 'below', 'between', 'among', 'within',
        'without', 'toward', 'against', 'upon', 'towards', 'onto', 'beneath',
        'under', 'over', 'via', 'using', 'based', 'towards', 'across',
        'toward', 'amongst', 'whilst', 'while', 'upon'
    }
    
    # Remove punctuation and extra spaces
    text = re.sub(r'[^\w\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    
    # Split and remove stop words
    words = text.strip().split()
    words = [w for w in words if w not in stop_words and len(w) > 2]
    
    return ' '.join(sorted(words))  # Sort words for consistency

def get_similarity(a, b):
    """Calculate similarity between two normalized titles."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()

def load_papers():
    """Load papers from JSON."""
    with open('papers.json', 'r', encoding='utf-8') as f:
        return json.load(f)

def load_excel_data():
    """Load Excel data with special character handling."""
    df = pd.read_excel('ACL 2025 Paper Assignments for Program.xlsx', 
                      sheet_name='ACL 25 Authors Assignments.', skiprows=1)
    
    # Clean up the data
    df = df.fillna('')
    
    # Convert dates to string format
    if 'Session Date' in df.columns:
        df['Session Date'] = df['Session Date'].astype(str)
        df['Session Date'] = df['Session Date'].replace('NaT', '')
    
    return df

def create_paper_mapping(papers):
    """Create a mapping of normalized titles to papers."""
    mapping = {}
    for paper in papers:
        normalized = aggressive_normalize(paper['title'])
        if normalized:
            if normalized not in mapping:
                mapping[normalized] = []
            mapping[normalized].append(paper)
    return mapping

def match_papers(papers, excel_df):
    """Match papers between Excel and JSON data."""
    paper_mapping = create_paper_mapping(papers)
    
    matches = []
    exact_matches = 0
    fuzzy_matches = 0
    
    print("Matching papers...")
    
    for idx, row in excel_df.iterrows():
        excel_title = str(row['Title']).strip()
        norm_excel = aggressive_normalize(excel_title)
        
        if not norm_excel:
            continue
            
        # Try exact normalized match
        if norm_excel in paper_mapping:
            matched_papers = paper_mapping[norm_excel]
            if matched_papers:
                paper = matched_papers[0]  # Take first match
                matches.append({
                    'excel_row': row,
                    'paper': paper,
                    'match_type': 'exact',
                    'score': 1.0
                })
                exact_matches += 1
                continue
        
        # Try fuzzy matching for close matches
        best_match = None
        best_score = 0
        
        for norm_paper_title, papers_list in paper_mapping.items():
            score = get_similarity(norm_excel, norm_paper_title)
            if score > 0.90 and score > best_score:  # 90% threshold
                best_score = score
                best_match = papers_list[0]
        
        if best_match:
            matches.append({
                'excel_row': row,
                'paper': best_match,
                'match_type': 'fuzzy',
                'score': best_score
            })
            fuzzy_matches += 1
    
    print(f"Matching completed:")
    print(f"  Exact matches: {exact_matches}")
    print(f"  Fuzzy matches: {fuzzy_matches}")
    print(f"  Total matched: {len(matches)}/{len(excel_df)}")
    
    return matches

def merge_paper_data(paper, excel_row):
    """Merge Excel data into paper data."""
    merged = paper.copy()
    
    # Add scheduling information from Excel
    merged.update({
        'abstract': str(excel_row.get('Abstract', paper.get('abstract', ''))).strip(),
        'presenter_name': str(excel_row.get('Presenters Name', '')).strip(),
        'is_registered': str(excel_row.get('Is Paper Registered?', '')).strip(),
        'presentation_type': str(excel_row.get('Type of Presentation', '')).strip(),
        'attendance_type': str(excel_row.get('Attendance Type', '')).strip(),
        'room_location': str(excel_row.get('Room Location', '')).strip(),
        'session': str(excel_row.get('Session', '')).strip(),
        'session_title': str(excel_row.get('Underline/Whova Session Titles', '')).strip(),
        'session_date': str(excel_row.get('Session Date', '')).strip(),
        'session_time': str(excel_row.get('Session time', '')).strip(),
        'sub_session': str(excel_row.get('Sub-session (ex. ML 1, ML 2, etc.)', '')).strip(),
        'excel_matched': True,
        'excel_match_confidence': 1.0
    })
    
    return merged

def save_merged_data(papers, matches, output_file='papers_merged.json'):
    """Save merged data to JSON."""
    
    # Create a mapping of paper identifiers to merged data
    matched_paper_ids = {match['paper']['paper_number']: match for match in matches}
    
    # Merge data
    merged_papers = []
    for paper in papers:
        if paper['paper_number'] in matched_paper_ids:
            # This paper has Excel data
            match = matched_paper_ids[paper['paper_number']]
            merged_paper = merge_paper_data(paper, match['excel_row'])
            merged_paper['excel_match_type'] = match['match_type']
            merged_paper['excel_match_confidence'] = match['score']
            merged_papers.append(merged_paper)
        else:
            # Keep original paper without Excel data
            paper_copy = paper.copy()
            paper_copy['excel_matched'] = False
            merged_papers.append(paper_copy)
    
    # Save merged data
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(merged_papers, f, indent=2, ensure_ascii=False)
    
    print(f"Saved {len(merged_papers)} papers to {output_file}")
    return merged_papers

def main():
    """Main function to merge Excel and JSON data."""
    print("Loading data...")
    papers = load_papers()
    excel_df = load_excel_data()
    
    print(f"Loaded {len(papers)} papers from JSON")
    print(f"Loaded {len(excel_df)} papers from Excel")
    
    # Match papers
    matches = match_papers(papers, excel_df)
    
    # Save merged data
    merged_papers = save_merged_data(papers, matches)
    
    # Print statistics
    matched_count = len([p for p in merged_papers if p.get('excel_matched')])
    print(f"\nFinal statistics:")
    print(f"Total papers: {len(merged_papers)}")
    print(f"Papers with Excel data: {matched_count}")
    print(f"Main conference papers with scheduling: {matched_count}")
    
    # Show sample merged data
    sample_matched = [p for p in merged_papers if p.get('excel_matched')][:3]
    print(f"\nSample merged papers:")
    for paper in sample_matched:
        print(f"  Title: {paper['title'][:60]}...")
        print(f"  Session: {paper.get('session', 'N/A')}")
        print(f"  Date: {paper.get('session_date', 'N/A')}")
        print(f"  Time: {paper.get('session_time', 'N/A')}")
        print(f"  Room: {paper.get('room_location', 'N/A')}")
        print(f"  Presenter: {paper.get('presenter_name', 'N/A')}")
        print()

if __name__ == "__main__":
    main()