#!/usr/bin/env python3
"""
Import poster board information from Excel files and merge with existing paper data.
Uses the existing fuzzy matching logic to match titles between Excel and JSON data.
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
        '–': '-', '—': '-', '"': '"', '"': '"', ''': "'", ''': "'",
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

def load_papers_merged():
    """Load papers from merged JSON."""
    with open('papers_merged.json', 'r', encoding='utf-8') as f:
        return json.load(f)

def load_poster_excel_data(excel_file):
    """Load poster board data from Excel file."""
    # Read all sheets to understand structure
    xl = pd.ExcelFile(excel_file)
    print(f"Available sheets: {xl.sheet_names}")
    
    poster_data = []
    
    for sheet_name in xl.sheet_names:
        # Process sheets that contain poster data (including Findings)
        if ('poster' in sheet_name.lower() or 'findings' in sheet_name.lower()) and 'monitor' not in sheet_name.lower():
            print(f"Processing sheet: {sheet_name}")
            
            # Read the sheet
            df = pd.read_excel(excel_file, sheet_name=sheet_name, header=1)
            
            # Skip if empty
            if df.empty:
                print(f"  Skipping empty sheet: {sheet_name}")
                continue
            
            # Clean column names
            df.columns = df.columns.str.strip()
            
            # Check if this sheet has the expected columns
            if 'Title' not in df.columns:
                print(f"  Skipping sheet without Title column: {sheet_name}")
                continue
            
            # Filter out empty rows and get poster data
            df = df.dropna(subset=['Title'])
            
            for _, row in df.iterrows():
                # Handle different column name formats between files
                hall = str(row.get('Hall Location', row.get('Hall #', row.get('Hall', '')))).strip()
                board = str(row.get('Board  #', row.get('Board #', row.get('Board', '')))).strip()
                paper_id = str(row.get('Paper ID', row.get('Paper number', ''))).strip()
                session_time = str(row.get('Session time', row.get('Session Time', ''))).strip()
                
                poster_info = {
                    'title': str(row.get('Title', '')).strip(),
                    'hall': hall,
                    'board_number': board,
                    'paper_id': paper_id,
                    'session': str(row.get('Session', '')).strip(),
                    'session_date': str(row.get('Session Date', '')).strip(),
                    'session_time': session_time,
                    'sheet_name': sheet_name
                }
                
                # Only add if we have essential info
                if poster_info['title'] and poster_info['board_number']:
                    poster_data.append(poster_info)
    
    print(f"Loaded {len(poster_data)} poster entries from Excel")
    return poster_data

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

def match_poster_data(papers, poster_data):
    """Match poster board data with existing papers."""
    paper_mapping = create_paper_mapping(papers)
    
    matches = []
    exact_matches = 0
    fuzzy_matches = 0
    unmatched = []
    
    print("Matching poster board data...")
    
    for poster_info in poster_data:
        poster_title = poster_info['title']
        norm_poster = aggressive_normalize(poster_title)
        
        if not norm_poster:
            continue
            
        # Try exact normalized match
        if norm_poster in paper_mapping:
            matched_papers = paper_mapping[norm_poster]
            if matched_papers:
                paper = matched_papers[0]  # Take first match
                matches.append({
                    'poster_info': poster_info,
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
            score = get_similarity(norm_poster, norm_paper_title)
            if score > 0.85 and score > best_score:  # 85% threshold for posters
                best_score = score
                best_match = papers_list[0]
        
        if best_match:
            matches.append({
                'poster_info': poster_info,
                'paper': best_match,
                'match_type': 'fuzzy',
                'score': best_score
            })
            fuzzy_matches += 1
        else:
            unmatched.append(poster_info)
    
    print(f"Matching completed:")
    print(f"  Exact matches: {exact_matches}")
    print(f"  Fuzzy matches: {fuzzy_matches}")
    print(f"  Total matched: {len(matches)}/{len(poster_data)}")
    print(f"  Unmatched: {len(unmatched)}")
    
    # Show some unmatched for debugging
    if unmatched:
        print(f"\nFirst 5 unmatched titles:")
        for i, poster in enumerate(unmatched[:5]):
            print(f"  {i+1}. {poster['title'][:80]}...")
            print(f"      Sheet: {poster['sheet_name']}")
    
    # Show breakdown by sheet
    print(f"\nMatches by sheet:")
    sheet_stats = {}
    for match in matches:
        sheet = match['poster_info']['sheet_name']
        sheet_stats[sheet] = sheet_stats.get(sheet, 0) + 1
    for sheet, count in sheet_stats.items():
        poster_count = len([p for p in poster_data if p['sheet_name'] == sheet])
        print(f"  {sheet}: {count}/{poster_count} matched")
    
    return matches, unmatched

def update_papers_with_poster_info(papers, matches):
    """Update papers with poster board information."""
    # Create mapping from paper number to poster info
    poster_mapping = {}
    for match in matches:
        paper_num = match['paper']['paper_number']
        poster_info = match['poster_info']
        
        poster_mapping[paper_num] = {
            'poster_hall': poster_info['hall'],
            'poster_board': poster_info['board_number'],
            'poster_session': poster_info['session'],
            'poster_session_date': poster_info['session_date'],
            'poster_session_time': poster_info['session_time'],
            'poster_match_type': match['match_type'],
            'poster_match_confidence': match['score']
        }
    
    # Update papers
    updated_papers = []
    updated_count = 0
    
    for paper in papers:
        paper_copy = paper.copy()
        
        if paper['paper_number'] in poster_mapping:
            paper_copy.update(poster_mapping[paper['paper_number']])
            updated_count += 1
        
        updated_papers.append(paper_copy)
    
    print(f"Updated {updated_count} papers with poster board information")
    return updated_papers

def save_updated_papers(papers, output_file='papers_merged.json'):
    """Save updated papers with poster board info."""
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(papers, f, indent=2, ensure_ascii=False)
    
    print(f"Saved {len(papers)} papers to {output_file}")

def main(excel_file):
    """Main function to import poster board data."""
    print(f"Importing poster board data from {excel_file}...")
    
    # Load existing merged papers
    papers = load_papers_merged()
    print(f"Loaded {len(papers)} papers from papers_merged.json")
    
    # Load poster data from Excel
    poster_data = load_poster_excel_data(excel_file)
    
    # Match poster data with papers
    matches, unmatched = match_poster_data(papers, poster_data)
    
    # Update papers with poster board info
    updated_papers = update_papers_with_poster_info(papers, matches)
    
    # Save updated data
    save_updated_papers(updated_papers)
    
    # Print summary
    poster_count = len([p for p in updated_papers if p.get('poster_board')])
    print(f"\nSummary:")
    print(f"Total papers: {len(updated_papers)}")
    print(f"Papers with poster board info: {poster_count}")
    
    # Show sample updated papers
    sample_posters = [p for p in updated_papers if p.get('poster_board')][:3]
    if sample_posters:
        print(f"\nSample papers with poster board info:")
        for paper in sample_posters:
            print(f"  Title: {paper['title'][:60]}...")
            print(f"  Hall: {paper.get('poster_hall', 'N/A')}")
            print(f"  Board: {paper.get('poster_board', 'N/A')}")
            print(f"  Session: {paper.get('poster_session', 'N/A')}")
            print()

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python import_poster_boards.py <excel_file>")
        sys.exit(1)
    
    excel_file = sys.argv[1]
    main(excel_file)